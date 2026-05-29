"""
Demo control endpoints — let the presenter trigger scenarios from the browser
without touching the terminal during a live demo.
"""
import asyncio
from fastapi import APIRouter, Query
from app.db import get_db
from app.services import sim_control
from datetime import datetime

router = APIRouter()

# How long the offline-buffer scenario holds writes before auto-flushing
OFFLINE_WINDOW_SECONDS = 20

_demo_overrides: dict = {
    "burst_failure": set(),
    "trending_failure": set(),
    "offline_buffer": False,
}


def get_demo_overrides() -> dict:
    return _demo_overrides


@router.post("/demo/burst-failure")
async def trigger_burst_failure(device_id: str = Query("device-015")):
    """Force a device to 100% failure rate — LED goes red, alert fires immediately."""
    from app.routes.test_runs import notify_sse, _check_and_create_alert

    _demo_overrides["burst_failure"].add(device_id)
    _demo_overrides["trending_failure"].discard(device_id)

    db = get_db()
    now = datetime.utcnow()

    # Insert all 5 failure records in a single round-trip
    docs = [
        {
            "device_id": device_id,
            "pattern_id": "loopback_v1",
            "started_at": now,
            "completed_at": now,
            "duration_ms": 412,
            "status": "fail",
            "led_state": "red",
            "results": {
                "overall": "fail",
                "components": [{"component_id": "pcie_card_1", "result": "fail", "error_code": "LB_TIMEOUT", "core_results": []}],
            },
            "triggered_by": "demo_control",
        }
        for _ in range(5)
    ]
    result = await db.test_runs.insert_many(docs)

    # Stream the trigger + each real write to the live feed so it's visibly real
    notify_sse(device_id, "red", "fail", now.isoformat(),
               event_type="demo", message=f"Demo: burst failure injected on {device_id} (5 writes)")
    for doc in docs:
        notify_sse(doc["device_id"], doc["led_state"], doc["status"], now.isoformat())

    # One alert check after all inserts — the aggregation sees all 5 at once
    await _check_and_create_alert(device_id, str(result.inserted_ids[-1]))

    return {"status": "burst_failure_triggered", "device_id": device_id}


@router.post("/demo/trending-failure")
async def trigger_trending_failure(device_id: str = Query("device-007")):
    """Set a device to an elevated failure rate and seed enough failures NOW that the
    alert fires immediately — deterministic, works whether or not the simulator runs."""
    from app.routes.test_runs import notify_sse, _check_and_create_alert

    _demo_overrides["trending_failure"].add(device_id)
    _demo_overrides["burst_failure"].discard(device_id)

    db = get_db()
    now = datetime.utcnow()

    # Seed 10 runs at ~20% failure rate (2 fails) so the 1-hour rate crosses the
    # 10% threshold right away. Last run is a fail so the LED reflects the trend.
    docs = []
    for i in range(10):
        is_fail = i in (4, 9)  # 2 of 10 → 20%, ending on a failure
        docs.append({
            "device_id": device_id,
            "pattern_id": "loopback_v1",
            "started_at": now,
            "completed_at": now,
            "duration_ms": 380 if is_fail else 210,
            "status": "fail" if is_fail else "pass",
            "led_state": "red" if is_fail else "green",
            "results": {
                "overall": "fail" if is_fail else "pass",
                "components": [{
                    "component_id": "pcie_card_1",
                    "result": "fail" if is_fail else "pass",
                    "error_code": "SIGNAL_INTEGRITY_ERR" if is_fail else None,
                    "core_results": [],
                }],
            },
            "triggered_by": "demo_control",
        })
    result = await db.test_runs.insert_many(docs)

    # Stream the trigger + each real write to the live feed so it's visibly real
    notify_sse(device_id, "red", "fail", now.isoformat(),
               event_type="demo", message=f"Demo: trending failure (~20%) seeded on {device_id} (10 writes)")
    for doc in docs:
        notify_sse(doc["device_id"], doc["led_state"], doc["status"], now.isoformat())

    await _check_and_create_alert(device_id, str(result.inserted_ids[-1]))

    return {"status": "trending_failure_triggered", "device_id": device_id}


@router.post("/demo/offline-buffer")
async def trigger_offline_buffer():
    """Simulate a network blackout — the simulator holds writes, then flushes them all
    at once. Auto-clears after the window so the flush actually happens on its own."""
    from app.routes.test_runs import notify_sse

    _demo_overrides["offline_buffer"] = True
    notify_sse("", "off", "buffering", datetime.utcnow().isoformat(),
               event_type="demo", message="Demo: edge offline — writes buffering locally…")

    async def _auto_flush():
        await asyncio.sleep(OFFLINE_WINDOW_SECONDS)
        _demo_overrides["offline_buffer"] = False
        notify_sse("", "green", "flushed", datetime.utcnow().isoformat(),
                   event_type="demo", message="Demo: edge reconnected — buffered writes flushed to Atlas")

    asyncio.create_task(_auto_flush())
    return {"status": "offline_buffer_active", "flush_in_seconds": OFFLINE_WINDOW_SECONDS}


@router.post("/demo/reset")
async def reset_fleet():
    """Clear demo overrides, flush each affected device's recent-run window with passes
    (so the last-N failure rate drops below threshold and the alert can't re-fire),
    resolve open alerts, and push green via SSE."""
    from app.routes.test_runs import notify_sse, ALERT_WINDOW_RUNS

    db = get_db()
    now = datetime.utcnow()

    # Devices to restore = those under an active override OR with an open alert
    override_devices = set(_demo_overrides["burst_failure"]) | set(_demo_overrides["trending_failure"])
    open_alert_devices = set(await db.alerts.distinct("device_id", {"status": "open"}))
    affected = sorted(override_devices | open_alert_devices)

    _demo_overrides["burst_failure"].clear()
    _demo_overrides["trending_failure"].clear()
    _demo_overrides["offline_buffer"] = False

    if affected:
        # Write a full window of passes per device so the recent-N rate goes to 0%
        pass_docs = []
        for device_id in affected:
            for _ in range(ALERT_WINDOW_RUNS):
                pass_docs.append({
                    "device_id": device_id,
                    "pattern_id": "loopback_v1",
                    "started_at": now,
                    "completed_at": now,
                    "duration_ms": 180,
                    "status": "pass",
                    "led_state": "green",
                    "results": {
                        "overall": "pass",
                        "components": [{"component_id": "pcie_card_1", "result": "pass", "error_code": None, "core_results": []}],
                    },
                    "triggered_by": "demo_reset",
                })
        await db.test_runs.insert_many(pass_docs)

    # Close any open alerts so the Alerts page returns to a clean slate
    closed = await db.alerts.update_many(
        {"status": "open"},
        {"$set": {"status": "resolved", "resolved_at": now}},
    )

    for device_id in affected:
        notify_sse(device_id, "green", "pass", now.isoformat(),
                   event_type="demo", message=f"Demo: reset → {device_id} restored to healthy")
        notify_sse(device_id, "green", "pass", now.isoformat())

    return {
        "status": "fleet_reset",
        "devices_restored": affected,
        "alerts_closed": closed.modified_count,
    }


@router.post("/demo/simulator/{action}")
async def control_simulator(action: str):
    """Start, stop, or restart the loopback simulator process from the browser."""
    from app.routes.test_runs import notify_sse

    now = datetime.utcnow().isoformat()
    if action == "start":
        started = sim_control.start()
        notify_sse("", "green", "running", now, event_type="demo",
                   message="Simulator started — loopbacks streaming to Atlas")
        return {"running": sim_control.is_running(), "changed": started}
    if action == "stop":
        stopped = sim_control.stop()
        notify_sse("", "off", "stopped", now, event_type="demo",
                   message="Simulator stopped — no new loopbacks")
        return {"running": sim_control.is_running(), "changed": stopped}
    if action == "restart":
        sim_control.restart()
        notify_sse("", "green", "running", now, event_type="demo",
                   message="Simulator restarted — loopbacks streaming to Atlas")
        return {"running": sim_control.is_running(), "changed": True}
    return {"error": f"unknown action '{action}'", "running": sim_control.is_running()}


@router.post("/demo/rerun/{device_id}")
async def rerun_device(device_id: str):
    """Immediately emit one test run for the specified device — useful from the control-plane
    context menu without waiting for the next simulator cycle."""
    import random
    from app.routes.test_runs import notify_sse, _check_and_create_alert

    db = get_db()
    now = datetime.utcnow()
    # Check if device is currently in burst/trending mode
    force_fail = device_id in _demo_overrides["burst_failure"]
    fail_rate = 0.15 if device_id in _demo_overrides["trending_failure"] else (1.0 if force_fail else 0.05)
    failed = force_fail or (random.random() < fail_rate)
    error_codes = ["LB_TIMEOUT", "CONTINUITY_FAIL", "SIGNAL_INTEGRITY_ERR"]
    doc = {
        "device_id": device_id,
        "pattern_id": "loopback_v1",
        "started_at": now,
        "completed_at": now,
        "duration_ms": random.randint(180, 520),
        "status": "fail" if failed else "pass",
        "led_state": "red" if failed else "green",
        "results": {
            "overall": "fail" if failed else "pass",
            "components": [{
                "component_id": "pcie_card_1",
                "result": "fail" if failed else "pass",
                "error_code": random.choice(error_codes) if failed else None,
                "core_results": [],
            }],
        },
        "triggered_by": "control_plane_rerun",
    }
    result = await db.test_runs.insert_one(doc)
    notify_sse(device_id, doc["led_state"], doc["status"], now.isoformat(),
               event_type="demo", message=f"Manual rerun triggered on {device_id}")
    if failed:
        await _check_and_create_alert(device_id, str(result.inserted_id))
    return {"status": "rerun_triggered", "device_id": device_id, "result": doc["status"]}


@router.post("/demo/set-failure-mode")
async def set_failure_mode(device_id: str = Query(...), mode: str = Query("none")):
    """Set a device's failure mode for the next simulator cycle.
    Accepted modes: none | intermittent | sticky | silent"""
    _demo_overrides.setdefault("failure_modes", {})[device_id] = mode
    # For sticky: unlock latching so the device can enter a fresh sticky cycle
    if mode == "none":
        _demo_overrides.setdefault("reset_devices", set()).add(device_id)
    return {"device_id": device_id, "failure_mode": mode}


@router.get("/demo/state")
async def get_demo_state():
    return {
        "burst_failure_devices": list(_demo_overrides["burst_failure"]),
        "trending_failure_devices": list(_demo_overrides["trending_failure"]),
        "offline_buffer": _demo_overrides["offline_buffer"],
        "simulator_running": sim_control.is_running(),
        "reset_devices": list(_demo_overrides.get("reset_devices", set())),
        "failure_modes": _demo_overrides.get("failure_modes", {}),
    }
