#!/usr/bin/env python3
"""
PulseBMC Simulator — emits loopback test results to the backend API.

Simulates the fleet management host forwarding BMC test results to Atlas.
All tests are loopback tests (loopback_v1) — one test type, three LED outcomes.

Failure modes:
  none         Normal operation at configured failure_rate
  intermittent Fails rarely; with temporal clustering and hysteresis so bad
               runs clump in time then clear, mimicking real degradation windows
  sticky       Latches on first failure; stays failed until explicit reset
  silent       Passes loopback but injects CRC corruption (visible in data,
               not in the LED — hard to catch without querying the documents)

Temporal realism:
  - On any failure, the device enters a degradation phase (4–8 cycles) where
    failure probability is 3× the base rate, creating temporal clusters.
  - Between failures, probability drops to 0.3× base (healthy window).
  - Temperature baseline pre-warms during degradation, reaching failure range
    before the LED changes — a predictive signal visible in the data.
  - Each device has a stable upstream fault controller assigned at startup, so
    the same device always implicates the same upstream component.

Usage:
  python emit_tests.py
  python emit_tests.py --burst-failure device-015
  python emit_tests.py --trending-failure device-007
  python emit_tests.py --offline-buffer-sim
  python emit_tests.py --interval 5
"""
import argparse
import json
import random
import time
import sys
from datetime import datetime, timezone
from pathlib import Path

import httpx
from nvme_adapter import NvmeAdapter

CONFIG_PATH = Path(__file__).parent / "config.json"

_nvme = NvmeAdapter()

ERROR_CODES = ["LB_TIMEOUT", "CONTINUITY_FAIL", "LOOPBACK_FAIL_TIMING", "SIGNAL_INTEGRITY_ERR", "LB_NO_RESPONSE"]
COMPONENTS = ["pcie_card_1", "pcie_card_2", "pcie_card_3"]
CORES_PER_COMPONENT = 4

# Temperature targets (°C)
_HEALTHY_TEMP_TARGET = 50.0
_DEGRADING_TEMP_TARGET = 76.0

# Upstream fault sources — assigned once per device based on device number
_FAULT_POOL = [
    "upstream_pcie_controller_A",
    "upstream_pcie_controller_B",
    "shared_pcie_hub_01",
    "pcie_switch_fabric_east",
]

# ── Per-device mutable state ───────────────────────────────────────────────────
_sticky_latched: dict[str, bool] = {}
_degradation_phase: dict[str, int] = {}   # remaining elevated-probability cycles
_last_outcome: dict[str, bool] = {}       # True = previous cycle failed
_device_temp_baseline: dict[str, float] = {}  # running temp baseline (°C)
_device_fault_sources: dict[str, str] = {}    # stable fault source per device


def _get_fault_source(device_id: str) -> str:
    """Assign a stable upstream fault controller to each device (deterministic)."""
    if device_id not in _device_fault_sources:
        num = int(device_id.split("-")[-1]) if "-" in device_id else 0
        _device_fault_sources[device_id] = _FAULT_POOL[num % len(_FAULT_POOL)]
    return _device_fault_sources[device_id]


def _get_temp_baseline(device_id: str) -> float:
    if device_id not in _device_temp_baseline:
        _device_temp_baseline[device_id] = _HEALTHY_TEMP_TARGET
    return _device_temp_baseline[device_id]


def make_core_temp(failing: bool, baseline_offset: float = 0.0) -> float:
    """Generate a realistic core temperature, shifted by the device's current baseline."""
    if failing:
        lo, hi = 68.0, 92.0
    else:
        lo, hi = 38.0, 62.0
    raw = random.uniform(lo, hi) + baseline_offset
    return round(min(95.0, max(25.0, raw)), 1)


def make_test_run(
    device_id: str,
    force_fail: bool = False,
    fail_rate: float = 0.02,
    failure_mode: str = "none",
) -> dict:
    now = datetime.now(timezone.utc)
    duration_ms = random.randint(200, 600)

    # ── Update temperature baseline ────────────────────────────────────────────
    in_degradation = _degradation_phase.get(device_id, 0) > 0
    baseline = _get_temp_baseline(device_id)

    if in_degradation:
        # Gradually rise toward degradation target (predictive pre-warning)
        baseline += (_DEGRADING_TEMP_TARGET - baseline) * 0.25
    else:
        # Cool down toward healthy baseline
        baseline += (_HEALTHY_TEMP_TARGET - baseline) * 0.20
    _device_temp_baseline[device_id] = baseline

    # Temperature offset applied to all cores this cycle
    temp_offset = max(0.0, baseline - _HEALTHY_TEMP_TARGET) * 0.6

    # ── Effective failure rate with temporal adjustments ───────────────────────
    effective_rate = fail_rate

    if in_degradation:
        # Degradation window: elevated probability
        effective_rate = min(fail_rate * 3.0, 0.65)

    if failure_mode == "intermittent":
        # Hysteresis: cluster failures, then clear
        last_failed = _last_outcome.get(device_id, False)
        if last_failed:
            effective_rate = min(effective_rate * 2.5, 0.40)
        else:
            effective_rate = effective_rate * 0.30

    # ── Determine outcome ──────────────────────────────────────────────────────
    if failure_mode == "sticky":
        if _sticky_latched.get(device_id):
            failed = True
        else:
            failed = force_fail or (random.random() < effective_rate)
            if failed:
                _sticky_latched[device_id] = True
    elif failure_mode == "silent":
        failed = False
    else:
        failed = force_fail or (random.random() < effective_rate)

    # ── Update temporal state ──────────────────────────────────────────────────
    _last_outcome[device_id] = failed

    if failed and not in_degradation:
        # Enter degradation phase when a failure occurs
        _degradation_phase[device_id] = random.randint(4, 8)
    elif in_degradation:
        _degradation_phase[device_id] -= 1
        if _degradation_phase[device_id] <= 0:
            del _degradation_phase[device_id]

    # ── Silent corruption (15% — rare, hard to catch) ─────────────────────────
    silent_corrupt = failure_mode == "silent" and random.random() < 0.15

    # ── Build component + core results ────────────────────────────────────────
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
                "temp_c": make_core_temp(core_fail, temp_offset),
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
    led_state = "red" if failed else "green"

    # ── Upstream fault source (stable per device, ~30% of real failures) ───────
    true_fault_source = None
    if failed and random.random() < 0.30:
        true_fault_source = _get_fault_source(device_id)

    # ── NVMe SMART telemetry (correlates with degradation state) ─────────────
    degrading_now = _degradation_phase.get(device_id, 0) > 0
    nvme_smart = _nvme.smart_log(device_id, degrading=degrading_now, temp_c=baseline)
    nvme_errors = _nvme.error_log(device_id, failed=failed)

    doc = {
        "device_id": device_id,
        "pattern_id": "loopback_v1",
        "started_at": now.isoformat(),
        "completed_at": now.isoformat(),
        "duration_ms": duration_ms,
        "status": overall,
        "led_state": led_state,
        "results": {"overall": overall, "components": components},
        "triggered_by": "simulator",
        "failure_mode": failure_mode if failure_mode != "none" else None,
        "nvme_smart": nvme_smart,
        "nvme_errors": nvme_errors if nvme_errors else None,
    }
    if true_fault_source:
        doc["true_fault_source"] = true_fault_source
    return doc


def main():
    parser = argparse.ArgumentParser(
        description="PulseBMC loopback test simulator",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--interval", type=float, default=None)
    parser.add_argument("--burst-failure", metavar="DEVICE_ID")
    parser.add_argument("--trending-failure", metavar="DEVICE_ID")
    parser.add_argument("--offline-buffer-sim", action="store_true")
    parser.add_argument("--api-url", default=None)
    args = parser.parse_args()

    config = json.loads(CONFIG_PATH.read_text())
    interval = args.interval or config.get("interval_seconds", 10)
    api_url = args.api_url or config.get("api_url", "http://localhost:8000")

    devices = {d["device_id"]: d for d in config["devices"]}

    if args.burst_failure:
        devices[args.burst_failure] = {"device_id": args.burst_failure, "failure_rate": 1.0, "failure_mode": "none"}
    if args.trending_failure:
        devices[args.trending_failure] = {"device_id": args.trending_failure, "failure_rate": 0.15, "failure_mode": "none"}

    # Pre-initialize stable fault sources for all configured devices
    for d in devices:
        _get_fault_source(d)

    print(f"PulseBMC Simulator started — {len(devices)} devices, {interval}s interval")
    if args.burst_failure:
        print(f"  Burst failure: {args.burst_failure} → 100%")
    if args.trending_failure:
        print(f"  Trending failure: {args.trending_failure} → 15%")
    if args.offline_buffer_sim:
        print("  Offline buffer sim: writes held 30s then flushed")
    print(f"  API: {api_url}")
    print()

    buffer = []
    buffer_until = time.time() + 30 if args.offline_buffer_sim else 0

    with httpx.Client(base_url=api_url, timeout=10) as client:
        while True:
            try:
                state_resp = client.get("/api/demo/state")
                if state_resp.status_code == 200:
                    demo_state = state_resp.json()
                    burst_set = set(demo_state.get("burst_failure_devices", []))
                    trending_set = set(demo_state.get("trending_failure_devices", []))
                    offline = demo_state.get("offline_buffer", False)
                    for d in demo_state.get("reset_devices", []):
                        _sticky_latched.pop(d, None)
                        _degradation_phase.pop(d, None)
                        _last_outcome.pop(d, None)
                        _device_temp_baseline[d] = _HEALTHY_TEMP_TARGET
                else:
                    burst_set, trending_set, offline = set(), set(), False
            except Exception:
                burst_set, trending_set, offline = set(), set(), False

            cycle_start = time.time()

            # Amber ping — show all devices as "testing" at cycle start
            try:
                client.post("/api/fleet/start-cycle", json={"device_ids": list(devices.keys())}, timeout=2)
            except Exception:
                pass

            for device_id, device in devices.items():
                base_rate = device.get("failure_rate", 0.02)
                failure_mode = device.get("failure_mode", "none")

                if device_id in burst_set or (args.burst_failure and device_id == args.burst_failure):
                    fail_rate, force, failure_mode = 1.0, True, "none"
                elif device_id in trending_set or (args.trending_failure and device_id == args.trending_failure):
                    fail_rate, force = 0.15, False
                else:
                    fail_rate, force = base_rate, False

                run = make_test_run(device_id, force_fail=force, fail_rate=fail_rate, failure_mode=failure_mode)
                led = run["led_state"]
                status = run["status"]

                error = next((f" ({c['error_code']})" for c in run["results"]["components"] if c.get("error_code")), "")
                corrupt = next((f" [CORRUPT CRC={c['corruption_crc']}]" for c in run["results"]["components"] if c.get("corruption_detected")), "")
                phase_note = f" [phase={_degradation_phase.get(device_id, 0)}]" if _degradation_phase.get(device_id) else ""
                label = f"[{device_id}] {status.upper()}{error}{corrupt}{phase_note} · {_device_temp_baseline.get(device_id, 50):.0f}°C"

                if offline or (args.offline_buffer_sim and time.time() < buffer_until):
                    buffer.append(run)
                    print(f"  BUFFERED {label}")
                    continue

                if buffer:
                    print(f"\n  Flushing {len(buffer)} buffered test runs...")
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
                        print(f"  {label}")
                    else:
                        print(f"  {label} [HTTP {resp.status_code}]")
                except httpx.ConnectError:
                    print(f"  {label} [backend unavailable]")

                # Emit thermal telemetry reading — the pre-warming signal that
                # rises before the LED changes. Stored in the time-series collection.
                try:
                    client.post("/api/telemetry", json={
                        "ts": run["started_at"],
                        "meta": {"device_id": device_id, "sensor_type": "thermal"},
                        "readings": {
                            "baseline_temp_c": round(_device_temp_baseline.get(device_id, 50.0), 1),
                            "in_degradation": _degradation_phase.get(device_id, 0) > 0,
                            "degradation_phase_remaining": _degradation_phase.get(device_id, 0),
                            "led_state": run["led_state"],
                        },
                    }, timeout=3)
                except Exception:
                    pass  # Telemetry emission is non-critical

            elapsed = time.time() - cycle_start
            time.sleep(max(0, interval - elapsed))


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nSimulator stopped.")
        sys.exit(0)
