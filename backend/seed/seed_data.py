#!/usr/bin/env python3
"""
PulseBMC seed script — bootstraps Atlas with devices, test patterns, and historical data.

What it creates:
  - 20 devices across 2 datacenters
  - 1 test pattern: loopback_v1
  - 48h of historical test runs (realistic failure rates)
  - 10 pre-embedded historical PCIe LB_TIMEOUT failures on device-003
    (these are the "prior incidents" the RAG demo agent retrieves)

Usage:
  python seed/seed_data.py           # Full seed
  python seed/seed_data.py --dry-run # Preview counts without writing
  python seed/seed_data.py --clear   # Drop existing data before seeding

Requires: ATLAS_URI and VOYAGE_API_KEY in backend/.env
"""
import argparse
import os
import sys
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Add parent to path so we can import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

import pymongo
from app.services.embeddings import build_embedding_text_for_test_run, embed_documents_sync

ATLAS_URI = os.environ.get("ATLAS_URI")
DB_NAME = "pulse_bmc"

DATACENTERS = [
    {"datacenter": "us-east-1", "racks": ["rack-A", "rack-B", "rack-C"]},
    {"datacenter": "us-west-2", "racks": ["rack-X", "rack-Y"]},
]
ERROR_CODES = ["LB_TIMEOUT", "CONTINUITY_FAIL", "LOOPBACK_FAIL_TIMING", "SIGNAL_INTEGRITY_ERR"]
COMPONENTS = ["pcie_card_1", "pcie_card_2", "pcie_card_3"]


def make_device(i: int) -> dict:
    dc = DATACENTERS[i % 2]
    rack = dc["racks"][i % len(dc["racks"])]
    return {
        "device_id": f"device-{i:03d}",
        "hostname": f"bmc-{dc['datacenter']}-{i:03d}",
        "location": {"datacenter": dc["datacenter"], "rack": rack, "slot": (i % 10) + 1},
        "hardware": {"bmc_arch": "ARM64", "cpu_cores": 2, "memory_gb": 2, "storage_types": ["eMMC"]},
        "status": "online",
        "registered_at": datetime.now(timezone.utc),
        "last_seen": datetime.now(timezone.utc),
    }


def make_test_run(device_id: str, ts: datetime, fail_rate: float = 0.03) -> dict:
    failed = random.random() < fail_rate
    components = []
    for comp_id in COMPONENTS:
        comp_failed = failed and random.random() < 0.6
        components.append({
            "component_id": comp_id,
            "result": "fail" if comp_failed else "pass",
            "error_code": random.choice(ERROR_CODES) if comp_failed else None,
            "core_results": [],
        })
    overall = "fail" if failed else "pass"
    return {
        "device_id": device_id,
        "pattern_id": "loopback_v1",
        "started_at": ts,
        "completed_at": ts + timedelta(milliseconds=random.randint(200, 600)),
        "duration_ms": random.randint(200, 600),
        "status": overall,
        "led_state": "red" if failed else "green",
        "results": {"overall": overall, "components": components},
        "triggered_by": "seed",
    }


def make_rag_seed_failure(i: int) -> dict:
    """Pre-embedded historical PCIe loopback timeout failure — the RAG demo retrieves these."""
    ts = datetime.now(timezone.utc) - timedelta(days=random.randint(1, 14))
    return {
        "device_id": "device-003",
        "pattern_id": "loopback_v1",
        "started_at": ts,
        "completed_at": ts + timedelta(milliseconds=412),
        "duration_ms": 412,
        "status": "fail",
        "led_state": "red",
        "results": {
            "overall": "fail",
            "components": [{
                "component_id": "pcie_card_1",
                "result": "fail",
                "error_code": "LB_TIMEOUT",
                "core_results": [{"core_id": f"core_{j}", "result": "fail" if j < 2 else "pass", "latency_ms": 7.2} for j in range(4)],
            }],
        },
        "triggered_by": "seed_rag",
    }


def main():
    parser = argparse.ArgumentParser(description="Seed PulseBMC Atlas database")
    parser.add_argument("--dry-run", action="store_true", help="Preview what would be inserted, no writes")
    parser.add_argument("--clear", action="store_true", help="Drop existing data before seeding")
    args = parser.parse_args()

    if not ATLAS_URI:
        print("ERROR: ATLAS_URI not set. Add it to backend/.env")
        sys.exit(1)

    client = pymongo.MongoClient(ATLAS_URI)
    db = client[DB_NAME]

    print("=== PulseBMC Seed Script ===")
    print(f"  Target: {DB_NAME} on Atlas")
    if args.dry_run:
        print("  Mode: DRY RUN (no writes)")
    print()

    if args.clear and not args.dry_run:
        print("[0/5] Clearing existing data...")
        db.devices.drop()
        db.test_patterns.drop()
        db.test_runs.drop()
        db.alerts.drop()
        db.agent_runs.drop()
        print("      Done.")

    # Step 1: Devices
    print("[1/5] Upserting 20 devices...", end="", flush=True)
    devices = [make_device(i) for i in range(1, 21)]
    if not args.dry_run:
        for d in devices:
            db.devices.update_one({"device_id": d["device_id"]}, {"$set": d}, upsert=True)
    print(f" done ({len(devices)} devices)")

    # Step 2: Test patterns
    print("[2/5] Upserting 1 test pattern (loopback_v1)...", end="", flush=True)
    pattern = {
        "pattern_id": "loopback_v1",
        "test_type": "loopback",
        "description": "PCIe loopback continuity and signal integrity test. DESTRUCTIVE — card goes offline during test.",
        "config": {"duration_ms": 400, "target_component": "pcie_card_1", "parameters": {"lanes": 16, "speed_gbps": 8.0}},
        "size_bytes": 8192,
        "tags": ["loopback", "pcie", "continuity", "health"],
        "version": "1.0",
    }
    if not args.dry_run:
        db.test_patterns.update_one({"pattern_id": "loopback_v1"}, {"$set": pattern}, upsert=True)
    print(" done")

    # Step 3: Historical test runs (48h)
    print("[3/5] Generating 48h of historical test runs...", end="", flush=True)
    now = datetime.now(timezone.utc)
    failure_rates = {
        "device-007": 0.12,  # Trending failure — crosses threshold
        "device-003": 0.08,
        "device-015": 0.03,
    }
    runs = []
    for device in devices:
        device_id = device["device_id"]
        fail_rate = failure_rates.get(device_id, 0.02)
        # One run every ~10 minutes for 48h = ~288 runs per device
        ts = now - timedelta(hours=48)
        while ts < now:
            runs.append(make_test_run(device_id, ts, fail_rate))
            ts += timedelta(seconds=600 + random.randint(-60, 60))

    if not args.dry_run:
        if runs:
            db.test_runs.insert_many(runs)

    # Guarantee every device ends on a green/pass so the fleet starts healthy
    final_runs = []
    for device in devices:
        device_id = device["device_id"]
        final_runs.append({
            "device_id": device_id,
            "pattern_id": "loopback_v1",
            "started_at": now,
            "completed_at": now + timedelta(milliseconds=200),
            "duration_ms": 200,
            "status": "pass",
            "led_state": "green",
            "results": {
                "overall": "pass",
                "components": [{"component_id": c, "result": "pass", "error_code": None, "core_results": []} for c in COMPONENTS],
            },
            "triggered_by": "seed",
        })
    if not args.dry_run:
        db.test_runs.insert_many(final_runs)

    print(f" done ({len(runs):,} runs + {len(final_runs)} final-pass records)")

    # Step 4: RAG seed failures with embeddings
    print("[4/5] Generating 10 historical PCIe failures for RAG demo...", end="", flush=True)
    rag_failures = [make_rag_seed_failure(i) for i in range(10)]
    if not args.dry_run:
        # Build embedding texts
        texts = [build_embedding_text_for_test_run(r) for r in rag_failures]
        print(f"\n        Embedding {len(texts)} documents via Voyage AI voyage-4-large...", end="", flush=True)
        try:
            embeddings = embed_documents_sync(texts)
            for i, run in enumerate(rag_failures):
                run["embedding_text"] = texts[i]
                run["embedding"] = embeddings[i]
                run["embedding_model"] = "voyage-4-large"
                run["embedded_at"] = datetime.now(timezone.utc)
        except Exception as e:
            print(f"\n        WARNING: Embedding failed ({e}). RAG demo will work once VOYAGE_API_KEY is set.")
        db.test_runs.insert_many(rag_failures)
    print(f" done ({len(rag_failures)} failures seeded)")

    # Step 5: Create an open alert for device-007 (trending failure scenario)
    print("[5/5] Creating open alert for device-007 (trending failure demo)...", end="", flush=True)
    alert = {
        "device_id": "device-007",
        "rule_id": "failure_rate_threshold",
        "triggered_at": now - timedelta(minutes=15),
        "severity": "high",
        "summary": "Device device-007 failure rate 12.3% over last hour (11/89 loopback tests failed) — exceeds 10% threshold",
        "linked_test_runs": [],
        "status": "open",
        "failure_rate": 0.123,
    }
    if not args.dry_run:
        db.alerts.update_one(
            {"device_id": "device-007", "status": "open"},
            {"$set": alert},
            upsert=True,
        )
    print(" done")

    print()
    print("=== Seed complete ===")
    if args.dry_run:
        print("  (dry run — nothing was written)")
    else:
        print(f"  Devices: 20")
        print(f"  Test patterns: 1 (loopback_v1)")
        print(f"  Historical runs: {len(runs):,}")
        print(f"  RAG seed failures: {len(rag_failures)} (with embeddings)")
        print(f"  Open alerts: 1 (device-007)")
        print()
        print("  Ready for demo. Start the stack with: ./start.sh")

    client.close()


if __name__ == "__main__":
    main()
