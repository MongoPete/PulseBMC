#!/usr/bin/env python3
"""
PulseBMC Simulator — emits loopback test results to the backend API.

Simulates the fleet management host forwarding BMC test results to Atlas.
All tests are loopback tests (loopback_v1) — one test type, three LED outcomes.

Usage:
  python emit_tests.py                         # Normal operation
  python emit_tests.py --burst-failure device-015
  python emit_tests.py --trending-failure device-007
  python emit_tests.py --offline-buffer-sim
  python emit_tests.py --interval 5            # Emit every 5s

Flags:
  --interval N          Seconds between emissions (default: from config, usually 10)
  --burst-failure ID    Force device ID to 100% failure rate until stopped
  --trending-failure ID Set device ID to 15% failure rate (crosses 10% threshold)
  --offline-buffer-sim  Hold all writes for 30s then flush — demonstrates edge buffering
  --api-url URL         Override API base URL (default: http://localhost:8000)
"""
import argparse
import json
import random
import time
import sys
import os
from datetime import datetime, timezone
from pathlib import Path

import httpx

CONFIG_PATH = Path(__file__).parent / "config.json"

ERROR_CODES = ["LB_TIMEOUT", "CONTINUITY_FAIL", "LOOPBACK_FAIL_TIMING", "SIGNAL_INTEGRITY_ERR", "LB_NO_RESPONSE"]
COMPONENTS = ["pcie_card_1", "pcie_card_2", "pcie_card_3"]
CORES_PER_COMPONENT = 4


def make_test_run(device_id: str, force_fail: bool = False, fail_rate: float = 0.02) -> dict:
    now = datetime.now(timezone.utc)
    duration_ms = random.randint(200, 600)
    completed = now

    failed = force_fail or (random.random() < fail_rate)

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
            })
        components.append({
            "component_id": comp_id,
            "result": "fail" if comp_failed else "pass",
            "error_code": random.choice(ERROR_CODES) if comp_failed else None,
            "core_results": core_results,
        })

    overall = "fail" if failed else "pass"
    led_state = "red" if failed else "green"

    return {
        "device_id": device_id,
        "pattern_id": "loopback_v1",
        "started_at": now.isoformat(),
        "completed_at": completed.isoformat(),
        "duration_ms": duration_ms,
        "status": overall,
        "led_state": led_state,
        "results": {"overall": overall, "components": components},
        "triggered_by": "simulator",
    }


def main():
    parser = argparse.ArgumentParser(
        description="PulseBMC loopback test simulator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--interval", type=float, default=None, help="Seconds between emissions")
    parser.add_argument("--burst-failure", metavar="DEVICE_ID", help="Force 100%% failure on this device")
    parser.add_argument("--trending-failure", metavar="DEVICE_ID", help="Set 15%% failure rate on this device")
    parser.add_argument("--offline-buffer-sim", action="store_true", help="Hold writes 30s then flush")
    parser.add_argument("--api-url", default=None, help="Backend API base URL")
    args = parser.parse_args()

    config = json.loads(CONFIG_PATH.read_text())
    interval = args.interval or config.get("interval_seconds", 10)
    api_url = args.api_url or config.get("api_url", "http://localhost:8000")

    devices = {d["device_id"]: d for d in config["devices"]}

    # Apply CLI overrides
    if args.burst_failure:
        devices[args.burst_failure] = {"device_id": args.burst_failure, "failure_rate": 1.0}
    if args.trending_failure:
        devices[args.trending_failure] = {"device_id": args.trending_failure, "failure_rate": 0.15}

    print(f"PulseBMC Simulator started — {len(devices)} devices, {interval}s interval")
    if args.burst_failure:
        print(f"  ⚡ Burst failure mode: {args.burst_failure} → 100% failure rate")
    if args.trending_failure:
        print(f"  📈 Trending failure: {args.trending_failure} → 15% failure rate")
    if args.offline_buffer_sim:
        print("  📵 Offline buffer sim: writes held 30s then flushed")
    print(f"  → API: {api_url}")
    print()

    buffer = []  # For offline-buffer-sim
    buffer_until = time.time() + 30 if args.offline_buffer_sim else 0

    with httpx.Client(base_url=api_url, timeout=10) as client:
        while True:
            # Check if we should also read demo overrides from the API
            try:
                state_resp = client.get("/api/demo/state")
                if state_resp.status_code == 200:
                    demo_state = state_resp.json()
                    burst_set = set(demo_state.get("burst_failure_devices", []))
                    trending_set = set(demo_state.get("trending_failure_devices", []))
                    offline = demo_state.get("offline_buffer", False)
                else:
                    burst_set, trending_set, offline = set(), set(), False
            except Exception:
                burst_set, trending_set, offline = set(), set(), False

            cycle_start = time.time()

            for device_id, device in devices.items():
                base_rate = device.get("failure_rate", 0.02)

                if device_id in burst_set or (args.burst_failure and device_id == args.burst_failure):
                    fail_rate, force = 1.0, True
                elif device_id in trending_set or (args.trending_failure and device_id == args.trending_failure):
                    fail_rate, force = 0.15, False
                else:
                    fail_rate, force = base_rate, False

                run = make_test_run(device_id, force_fail=force, fail_rate=fail_rate)
                led = run["led_state"]
                status = run["status"]
                error = ""
                for comp in run["results"]["components"]:
                    if comp.get("error_code"):
                        error = f" ({comp['error_code']})"
                        break

                label = f"[{device_id}] loopback → {status.upper()}{error} · led={led}"

                if offline or (args.offline_buffer_sim and time.time() < buffer_until):
                    buffer.append(run)
                    print(f"  📵 BUFFERED {label}")
                    continue

                # Flush buffer if offline window expired
                if buffer:
                    print(f"\n  ↑ Flushing {len(buffer)} buffered test runs...")
                    for buffered_run in buffer:
                        try:
                            client.post("/api/test-runs", json=buffered_run)
                        except Exception:
                            pass
                    buffer.clear()
                    print()

                try:
                    resp = client.post("/api/test-runs", json=run)
                    if resp.status_code == 201:
                        alert_note = " · ⚠ alert triggered" if status == "fail" and fail_rate > 0.10 else ""
                        print(f"  {label}{alert_note}")
                    else:
                        print(f"  {label} [HTTP {resp.status_code}]")
                except httpx.ConnectError:
                    print(f"  {label} [backend unavailable]")

            elapsed = time.time() - cycle_start
            sleep_time = max(0, interval - elapsed)
            time.sleep(sleep_time)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nSimulator stopped.")
        sys.exit(0)
