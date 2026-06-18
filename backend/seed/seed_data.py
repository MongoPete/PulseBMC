#!/usr/bin/env python3
"""
SoCPulse seed script — bootstraps Atlas with devices, test patterns, and historical data.

What it creates:
  - 20 devices across 2 datacenters (with realistic operational statuses)
  - 1 test pattern: loopback_v1 (PCIe in-system loopback / Tessent IST style)
  - 48h of historical test runs with core-level results, failure modes, NVMe SMART
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

# Add parent + simulator to path so we can import app + NvmeAdapter
_backend = Path(__file__).parent.parent
sys.path.insert(0, str(_backend))
sys.path.insert(0, str(_backend / "simulator"))

from dotenv import load_dotenv
load_dotenv(_backend / ".env")

import pymongo
from nvme_adapter import NvmeAdapter
from app.services.embeddings import build_embedding_text_for_test_run, embed_documents_sync

ATLAS_URI = os.environ.get("ATLAS_URI")
DB_NAME = "pulse_bmc"

DATACENTERS = [
    {"datacenter": "us-east-1", "racks": ["rack-A", "rack-B", "rack-C"]},
    {"datacenter": "us-west-2", "racks": ["rack-X", "rack-Y"]},
]
ERROR_CODES = ["LB_TIMEOUT", "CONTINUITY_FAIL", "LOOPBACK_FAIL_TIMING", "SIGNAL_INTEGRITY_ERR"]
COMPONENTS = ["pcie_card_1", "pcie_card_2", "pcie_card_3"]
CORES_PER_COMPONENT = 4
FAULT_POOL = [
    "upstream_pcie_controller_A",
    "upstream_pcie_controller_B",
    "shared_pcie_hub_01",
    "pcie_switch_fabric_east",
]

# Matches simulator/config.json — drives failure_mode behavior in seeded history
DEVICE_PROFILES = {
    "device-003": {"fail_rate": 0.06, "failure_mode": "intermittent"},
    "device-007": {"fail_rate": 0.12, "failure_mode": "none"},       # trending failure alert
    "device-008": {"fail_rate": 0.04, "failure_mode": "sticky"},
    "device-012": {"fail_rate": 0.02, "failure_mode": "silent"},
    "device-015": {"fail_rate": 0.03, "failure_mode": "intermittent"},
    "device-019": {"fail_rate": 0.02, "failure_mode": "intermittent"},
}

DEVICE_STATUS = {
    "device-001": "offline",
    "device-007": "degrading",
    "device-008": "maintenance",
}


def _iso(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")


def make_device(i: int) -> dict:
    dc = DATACENTERS[i % 2]
    rack = dc["racks"][i % len(dc["racks"])]
    device_id = f"device-{i:03d}"
    now = datetime.now(timezone.utc)
    return {
        "device_id": device_id,
        "hostname": f"bmc-{dc['datacenter']}-{i:03d}",
        "location": {"datacenter": dc["datacenter"], "rack": rack, "slot": (i % 10) + 1},
        "hardware": {"bmc_arch": "ARM64", "cpu_cores": 2, "memory_gb": 2, "storage_types": ["eMMC"]},
        "status": DEVICE_STATUS.get(device_id, "online"),
        "registered_at": _iso(now - timedelta(days=30)),
        "last_seen": _iso(now),
    }


class SeedRunGenerator:
    """Generates realistic in-system loopback test runs matching the live simulator schema."""

    def __init__(self):
        self._sticky_latched: dict[str, bool] = {}
        self._last_outcome: dict[str, bool] = {}
        self._degradation_phase: dict[str, int] = {}
        self._temp_baseline: dict[str, float] = {}
        self._fault_sources: dict[str, str] = {}
        self._nvme = NvmeAdapter()

    def _fault_source(self, device_id: str) -> str:
        if device_id not in self._fault_sources:
            num = int(device_id.split("-")[-1])
            self._fault_sources[device_id] = FAULT_POOL[num % len(FAULT_POOL)]
        return self._fault_sources[device_id]

    def _core_temp(self, failing: bool, offset: float) -> float:
        lo, hi = (68.0, 92.0) if failing else (38.0, 62.0)
        return round(min(95.0, max(25.0, random.uniform(lo, hi) + offset)), 1)

    def make_test_run(self, device_id: str, ts: datetime, fail_rate: float = 0.02, failure_mode: str = "none") -> dict:
        duration_ms = random.randint(200, 600)
        in_degradation = self._degradation_phase.get(device_id, 0) > 0
        baseline = self._temp_baseline.get(device_id, 50.0)

        if in_degradation:
            baseline += (76.0 - baseline) * 0.25
        else:
            baseline += (50.0 - baseline) * 0.20
        self._temp_baseline[device_id] = baseline
        temp_offset = max(0.0, baseline - 50.0) * 0.6

        effective_rate = fail_rate
        if in_degradation:
            effective_rate = min(fail_rate * 3.0, 0.65)
        if failure_mode == "intermittent":
            if self._last_outcome.get(device_id, False):
                effective_rate = min(effective_rate * 2.5, 0.40)
            else:
                effective_rate *= 0.30

        if failure_mode == "sticky":
            if self._sticky_latched.get(device_id):
                failed = True
            else:
                failed = random.random() < effective_rate
                if failed:
                    self._sticky_latched[device_id] = True
        elif failure_mode == "silent":
            failed = False
        else:
            failed = random.random() < effective_rate

        self._last_outcome[device_id] = failed
        if failed and not in_degradation:
            self._degradation_phase[device_id] = random.randint(4, 8)
        elif in_degradation:
            self._degradation_phase[device_id] -= 1
            if self._degradation_phase[device_id] <= 0:
                del self._degradation_phase[device_id]

        silent_corrupt = failure_mode == "silent" and random.random() < 0.15

        components = []
        for comp_id in COMPONENTS:
            comp_failed = failed and random.random() < 0.7
            core_results = []
            for i in range(CORES_PER_COMPONENT):
                core_fail = comp_failed and random.random() < 0.5
                core_results.append({
                    "core_id": f"core_{i}",
                    "result": "fail" if core_fail else "pass",
                    "latency_ms": round(random.uniform(1.0, 8.0), 2),
                    "temp_c": self._core_temp(core_fail, temp_offset),
                })
            comp_doc = {
                "component_id": comp_id,
                "result": "fail" if comp_failed else "pass",
                "error_code": random.choice(ERROR_CODES) if comp_failed else None,
                "core_results": core_results,
            }
            if silent_corrupt and comp_id == COMPONENTS[0]:
                comp_doc["corruption_detected"] = True
                comp_doc["corruption_crc"] = f"0x{random.randint(0x1000, 0xFFFF):04X}"
            components.append(comp_doc)

        overall = "fail" if failed else "pass"
        completed = ts + timedelta(milliseconds=duration_ms)
        true_fault_source = self._fault_source(device_id) if failed and random.random() < 0.30 else None
        nvme_smart = self._nvme.smart_log(device_id, degrading=in_degradation, temp_c=baseline)
        nvme_errors = self._nvme.error_log(device_id, failed=failed)

        doc = {
            "device_id": device_id,
            "pattern_id": "loopback_v1",
            "started_at": _iso(ts),
            "completed_at": _iso(completed),
            "duration_ms": duration_ms,
            "status": overall,
            "led_state": "red" if failed else "green",
            "results": {"overall": overall, "components": components},
            "triggered_by": "seed",
            "failure_mode": failure_mode if failure_mode != "none" else None,
            "nvme_smart": nvme_smart,
            "nvme_errors": nvme_errors if nvme_errors else None,
        }
        if true_fault_source:
            doc["true_fault_source"] = true_fault_source
        return doc


def make_rag_seed_failure(i: int) -> dict:
    """Pre-embedded historical PCIe loopback timeout failure — the RAG demo retrieves these."""
    # Keep within 7 days so Explore "this week" / starter chips still hit LB_TIMEOUT rows
    ts = datetime.now(timezone.utc) - timedelta(days=random.randint(1, 6))
    duration_ms = 412
    core_results = [
        {"core_id": f"core_{j}", "result": "fail" if j < 2 else "pass", "latency_ms": 7.2, "temp_c": 84.5 if j < 2 else 52.1}
        for j in range(4)
    ]
    return {
        "device_id": "device-003",
        "pattern_id": "loopback_v1",
        "started_at": _iso(ts),
        "completed_at": _iso(ts + timedelta(milliseconds=duration_ms)),
        "duration_ms": duration_ms,
        "status": "fail",
        "led_state": "red",
        "failure_mode": "intermittent",
        "true_fault_source": "upstream_pcie_controller_A",
        "results": {
            "overall": "fail",
            "components": [{
                "component_id": "pcie_card_1",
                "result": "fail",
                "error_code": "LB_TIMEOUT",
                "core_results": core_results,
            }],
        },
        "nvme_smart": {
            "critical_warning": 0,
            "temperature": 78,
            "media_errors": 12,
            "num_err_log_entries": 4,
            "available_spare": 92,
            "percentage_used": 5,
        },
        "triggered_by": "seed_rag",
    }


def _explore_demo_fixture_runs(now: datetime) -> list[dict]:
    """
    Deterministic test_runs in the last ~24h so /explore starter questions and NL
    examples return rows without relying on RNG from the 48h synthetic history.
    """
    def iso(ts: datetime) -> str:
        return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")

    def cores_pass(lat_ms: float = 2.1, temp_c: float = 49.0) -> list[dict]:
        return [
            {"core_id": f"core_{j}", "result": "pass", "latency_ms": lat_ms, "temp_c": temp_c}
            for j in range(CORES_PER_COMPONENT)
        ]

    docs: list[dict] = []

    def add(
        device_id: str,
        hours_ago: float,
        status: str,
        led_state: str,
        components: list[dict],
        **extra: object,
    ) -> None:
        st = now - timedelta(hours=hours_ago)
        dur = 400
        completed = st + timedelta(milliseconds=dur)
        doc: dict = {
            "device_id": device_id,
            "pattern_id": "loopback_v1",
            "started_at": iso(st),
            "completed_at": iso(completed),
            "duration_ms": dur,
            "status": status,
            "led_state": led_state,
            "results": {"overall": status, "components": components},
            "triggered_by": "seed_explore",
        }
        doc.update(extra)
        docs.append(doc)

    # LB_TIMEOUT on pcie_card_1 (starter + NL)
    add(
        "device-015",
        2.0,
        "fail",
        "red",
        [{
            "component_id": "pcie_card_1",
            "result": "fail",
            "error_code": "LB_TIMEOUT",
            "core_results": cores_pass(lat_ms=7.0, temp_c=72.0),
        }]
        + [
            {
                "component_id": cid,
                "result": "pass",
                "error_code": None,
                "core_results": cores_pass(),
            }
            for cid in ("pcie_card_2", "pcie_card_3")
        ],
        failure_mode="intermittent",
        true_fault_source="upstream_pcie_controller_A",
        nvme_smart={
            "critical_warning": 0,
            "temperature": 72,
            "media_errors": 6,
            "num_err_log_entries": 1,
            "available_spare": 95,
            "percentage_used": 4,
        },
    )

    # Error code mix: SIGNAL_INTEGRITY_ERR vs CONTINUITY_FAIL (last 7d)
    add(
        "device-014",
        3.5,
        "fail",
        "red",
        [{
            "component_id": "pcie_card_1",
            "result": "fail",
            "error_code": "SIGNAL_INTEGRITY_ERR",
            "core_results": cores_pass(lat_ms=5.5, temp_c=68.0),
        }]
        + [
            {
                "component_id": cid,
                "result": "pass",
                "error_code": None,
                "core_results": cores_pass(),
            }
            for cid in ("pcie_card_2", "pcie_card_3")
        ],
    )
    add(
        "device-014",
        4.0,
        "fail",
        "red",
        [{
            "component_id": "pcie_card_1",
            "result": "fail",
            "error_code": "CONTINUITY_FAIL",
            "core_results": cores_pass(lat_ms=4.2, temp_c=55.0),
        }]
        + [
            {
                "component_id": cid,
                "result": "pass",
                "error_code": None,
                "core_results": cores_pass(),
            }
            for cid in ("pcie_card_2", "pcie_card_3")
        ],
    )

    # Core temp > 80°C on pcie_card_1
    hot_cores = [
        {"core_id": "core_0", "result": "fail", "latency_ms": 3.0, "temp_c": 86.0},
        {"core_id": "core_1", "result": "fail", "latency_ms": 2.8, "temp_c": 82.5},
        {"core_id": "core_2", "result": "pass", "latency_ms": 2.1, "temp_c": 54.0},
        {"core_id": "core_3", "result": "pass", "latency_ms": 2.0, "temp_c": 53.0},
    ]
    add(
        "device-004",
        5.0,
        "fail",
        "red",
        [{
            "component_id": "pcie_card_1",
            "result": "fail",
            "error_code": "LOOPBACK_FAIL_TIMING",
            "core_results": hot_cores,
        }]
        + [
            {
                "component_id": cid,
                "result": "pass",
                "error_code": None,
                "core_results": cores_pass(),
            }
            for cid in ("pcie_card_2", "pcie_card_3")
        ],
    )

    # Core latency > 6ms on pcie_card_1 (overall pass)
    lat_cores = [
        {"core_id": f"core_{j}", "result": "pass", "latency_ms": 8.2 if j == 0 else 2.0, "temp_c": 48.0}
        for j in range(CORES_PER_COMPONENT)
    ]
    add(
        "device-009",
        6.0,
        "pass",
        "green",
        [{
            "component_id": "pcie_card_1",
            "result": "pass",
            "error_code": None,
            "core_results": lat_cores,
        }]
        + [
            {
                "component_id": cid,
                "result": "pass",
                "error_code": None,
                "core_results": cores_pass(),
            }
            for cid in ("pcie_card_2", "pcie_card_3")
        ],
    )

    # Silent: pass + corruption_detected (starter NL)
    silent_cores = cores_pass()
    add(
        "device-012",
        7.0,
        "pass",
        "green",
        [{
            "component_id": "pcie_card_1",
            "result": "pass",
            "error_code": None,
            "corruption_detected": True,
            "corruption_crc": "0xA3F1",
            "core_results": silent_cores,
        }]
        + [
            {
                "component_id": cid,
                "result": "pass",
                "error_code": None,
                "core_results": cores_pass(),
            }
            for cid in ("pcie_card_2", "pcie_card_3")
        ],
        failure_mode="silent",
        nvme_smart={
            "critical_warning": 0,
            "temperature": 52,
            "media_errors": 1,
            "num_err_log_entries": 0,
            "available_spare": 98,
            "percentage_used": 3,
        },
    )

    # Intermittent failure_mode on a fail row (facet + NL)
    add(
        "device-003",
        8.0,
        "fail",
        "red",
        [{
            "component_id": "pcie_card_1",
            "result": "fail",
            "error_code": "LB_TIMEOUT",
            "core_results": cores_pass(lat_ms=6.5, temp_c=70.0),
        }]
        + [
            {
                "component_id": cid,
                "result": "pass",
                "error_code": None,
                "core_results": cores_pass(),
            }
            for cid in ("pcie_card_2", "pcie_card_3")
        ],
        failure_mode="intermittent",
    )

    # NVMe media_errors spread (highest should be device-006)
    add(
        "device-005",
        9.0,
        "fail",
        "red",
        [{
            "component_id": "pcie_card_1",
            "result": "fail",
            "error_code": "SIGNAL_INTEGRITY_ERR",
            "core_results": cores_pass(),
        }]
        + [
            {
                "component_id": cid,
                "result": "pass",
                "error_code": None,
                "core_results": cores_pass(),
            }
            for cid in ("pcie_card_2", "pcie_card_3")
        ],
        nvme_smart={
            "critical_warning": 0,
            "temperature": 61,
            "media_errors": 88,
            "num_err_log_entries": 6,
            "available_spare": 90,
            "percentage_used": 8,
        },
    )
    add(
        "device-006",
        9.5,
        "fail",
        "red",
        [{
            "component_id": "pcie_card_1",
            "result": "fail",
            "error_code": "CONTINUITY_FAIL",
            "core_results": cores_pass(),
        }]
        + [
            {
                "component_id": cid,
                "result": "pass",
                "error_code": None,
                "core_results": cores_pass(),
            }
            for cid in ("pcie_card_2", "pcie_card_3")
        ],
        nvme_smart={
            "critical_warning": 1,
            "temperature": 67,
            "media_errors": 214,
            "num_err_log_entries": 14,
            "available_spare": 82,
            "percentage_used": 11,
        },
    )

    # Datacenter rollups: us-east-1 (device-002) vs us-west-2 (device-011) — more fails east
    def east_fail_components() -> list[dict]:
        return [
            {
                "component_id": "pcie_card_1",
                "result": "fail",
                "error_code": "LB_TIMEOUT",
                "core_results": cores_pass(lat_ms=5.0, temp_c=65.0),
            },
            *[
                {
                    "component_id": cid,
                    "result": "pass",
                    "error_code": None,
                    "core_results": cores_pass(),
                }
                for cid in ("pcie_card_2", "pcie_card_3")
            ],
        ]

    for h in (10.0, 11.0, 12.0):
        add("device-002", h, "fail", "red", east_fail_components())
    add(
        "device-011",
        11.5,
        "fail",
        "red",
        [{
            "component_id": "pcie_card_1",
            "result": "fail",
            "error_code": "CONTINUITY_FAIL",
            "core_results": cores_pass(),
        }]
        + [
            {
                "component_id": cid,
                "result": "pass",
                "error_code": None,
                "core_results": cores_pass(),
            }
            for cid in ("pcie_card_2", "pcie_card_3")
        ],
    )

    # true_fault_source grouping
    for h in (13.0, 14.0):
        add(
            "device-010",
            h,
            "fail",
            "red",
            [{
                "component_id": "pcie_card_1",
                "result": "fail",
                "error_code": "SIGNAL_INTEGRITY_ERR",
                "core_results": cores_pass(),
            }]
            + [
                {
                    "component_id": cid,
                    "result": "pass",
                    "error_code": None,
                    "core_results": cores_pass(),
                }
                for cid in ("pcie_card_2", "pcie_card_3")
            ],
            true_fault_source="upstream_pcie_controller_B",
        )

    return docs


def main():
    parser = argparse.ArgumentParser(description="Seed SoCPulse Atlas database")
    parser.add_argument("--dry-run", action="store_true", help="Preview what would be inserted, no writes")
    parser.add_argument("--clear", action="store_true", help="Drop existing data before seeding")
    args = parser.parse_args()

    if not ATLAS_URI:
        print("ERROR: ATLAS_URI not set. Add it to backend/.env")
        sys.exit(1)

    client = pymongo.MongoClient(ATLAS_URI)
    db = client[DB_NAME]

    print("=== SoCPulse Seed Script ===")
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
        "description": "PCIe loopback continuity and signal integrity test (Tessent In-System Test style). DESTRUCTIVE — card goes offline during test.",
        "config": {"duration_ms": 400, "target_component": "pcie_card_1", "parameters": {"lanes": 16, "speed_gbps": 8.0}},
        "size_bytes": 8192,
        "tags": ["loopback", "pcie", "continuity", "health", "in-system-test"],
        "version": "1.0",
    }
    if not args.dry_run:
        db.test_patterns.update_one({"pattern_id": "loopback_v1"}, {"$set": pattern}, upsert=True)
    print(" done")

    # Step 3: Historical test runs (48h)
    print("[3/5] Generating 48h of historical test runs...", end="", flush=True)
    now = datetime.now(timezone.utc)
    generator = SeedRunGenerator()
    runs = []
    for device in devices:
        device_id = device["device_id"]
        profile = DEVICE_PROFILES.get(device_id, {"fail_rate": 0.02, "failure_mode": "none"})
        ts = now - timedelta(hours=48)
        while ts < now:
            runs.append(generator.make_test_run(
                device_id, ts,
                fail_rate=profile["fail_rate"],
                failure_mode=profile["failure_mode"],
            ))
            ts += timedelta(seconds=600 + random.randint(-60, 60))

    if not args.dry_run:
        if runs:
            db.test_runs.insert_many(runs)

    # Deterministic rows for Explore starter questions (last 24h / 7d windows, NL-friendly fields)
    explore_docs = _explore_demo_fixture_runs(now)
    if not args.dry_run and explore_docs:
        db.test_runs.insert_many(explore_docs)

    # Guarantee every device ends on a green/pass so the fleet starts healthy
    final_runs = []
    for device in devices:
        device_id = device["device_id"]
        core_results = [
            {"core_id": f"core_{j}", "result": "pass", "latency_ms": 2.1, "temp_c": 48.0}
            for j in range(CORES_PER_COMPONENT)
        ]
        final_runs.append({
            "device_id": device_id,
            "pattern_id": "loopback_v1",
            "started_at": _iso(now),
            "completed_at": _iso(now + timedelta(milliseconds=200)),
            "duration_ms": 200,
            "status": "pass",
            "led_state": "green",
            "results": {
                "overall": "pass",
                "components": [
                    {"component_id": c, "result": "pass", "error_code": None, "core_results": core_results}
                    for c in COMPONENTS
                ],
            },
            "triggered_by": "seed",
            "nvme_smart": generator._nvme.smart_log(device_id, degrading=False, temp_c=48.0),
        })
    if not args.dry_run:
        db.test_runs.insert_many(final_runs)

    print(f" done ({len(runs):,} runs + {len(explore_docs)} explore fixtures + {len(final_runs)} final-pass records)")

    # Step 4: RAG seed failures with embeddings
    print("[4/5] Generating 10 historical PCIe failures for RAG demo...", end="", flush=True)
    rag_failures = [make_rag_seed_failure(i) for i in range(10)]
    if not args.dry_run:
        texts = [build_embedding_text_for_test_run(r) for r in rag_failures]
        print(f"\n        Embedding {len(texts)} documents via Voyage AI voyage-4-large...", end="", flush=True)
        try:
            embeddings = embed_documents_sync(texts)
            for i, run in enumerate(rag_failures):
                run["embedding_text"] = texts[i]
                run["embedding"] = embeddings[i]
                run["embedding_model"] = "voyage-4-large"
                run["embedded_at"] = _iso(datetime.now(timezone.utc))
        except Exception as e:
            print(f"\n        WARNING: Embedding failed ({e}). RAG demo will work once VOYAGE_API_KEY is set.")
        db.test_runs.insert_many(rag_failures)
    print(f" done ({len(rag_failures)} failures seeded)")

    # Step 5: Create an open alert for device-007 (trending failure scenario)
    print("[5/5] Creating open alert for device-007 (trending failure demo)...", end="", flush=True)
    alert = {
        "device_id": "device-007",
        "rule_id": "failure_rate_threshold",
        "triggered_at": _iso(now - timedelta(minutes=15)),
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
