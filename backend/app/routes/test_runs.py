import asyncio
import json
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.db import get_db
from app.models.test_run import TestRunCreate
from app.models.common import QueryInfo

router = APIRouter()

# In-memory SSE subscriber queues
_sse_subscribers: list[asyncio.Queue] = []


def notify_sse(
    device_id: str,
    led_state: str,
    status: str,
    started_at: str,
    event_type: str = "test_run",
    message: str = "",
):
    """Push an event to all connected SSE clients. Call-safe from any route."""
    payload = {
        "event_type": event_type,
        "device_id": device_id,
        "led_state": led_state,
        "status": status,
        "started_at": started_at,
        "message": message,
    }
    for q in list(_sse_subscribers):
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            pass


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id", ""))
    doc.pop("embedding", None)
    return doc


ALERT_WINDOW_RUNS = 15  # evaluate failure rate over the most recent N runs


async def _check_and_create_alert(device_id: str, test_run_id: str):
    """After insert, compute the failure rate over the most recent ALERT_WINDOW_RUNS
    test runs and upsert an open alert if >10%. A recent-N window (rather than a time
    window) stays sensitive even when the fleet emits many passing runs per minute."""
    db = get_db()

    pipeline = [
        {"$match": {"device_id": device_id}},
        {"$sort": {"started_at": -1}},
        {"$limit": ALERT_WINDOW_RUNS},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "failures": {"$sum": {"$cond": [{"$eq": ["$status", "fail"]}, 1, 0]}},
        }},
    ]
    result = await db.test_runs.aggregate(pipeline).to_list(1)
    if not result:
        return

    total = result[0]["total"]
    failures = result[0]["failures"]
    if total == 0:
        return

    failure_rate = failures / total
    if failure_rate <= 0.10:
        return

    summary = (
        f"Device {device_id} failure rate {failure_rate:.1%} over last {total} tests "
        f"({failures}/{total} loopback tests failed) — exceeds 10% threshold"
    )

    severity = "high" if failure_rate < 0.25 else "critical"
    await db.alerts.update_one(
        {"device_id": device_id, "status": "open"},
        {"$set": {
            "device_id": device_id,
            "rule_id": "failure_rate_threshold",
            "triggered_at": datetime.utcnow(),
            "severity": severity,
            "summary": summary,
            "status": "open",
            "failure_rate": failure_rate,
        }, "$addToSet": {"linked_test_runs": test_run_id}},
        upsert=True,
    )
    notify_sse(
        device_id=device_id,
        led_state="red",
        status="fail",
        started_at=datetime.utcnow().isoformat(),
        event_type="alert",
        message=f"Alert fired — {failure_rate:.0%} failure rate ({failures}/{total} runs)",
    )


async def _embed_failed_run(doc_id: str):
    """Background: generate Voyage AI embedding for a failed test run."""
    try:
        from app.services.embeddings import embed_and_update_test_run
        await embed_and_update_test_run(doc_id)
    except Exception:
        pass  # Non-critical — embedding failure never blocks the ingest path


@router.post("/test-runs", status_code=201)
async def ingest_test_run(run: TestRunCreate, background: BackgroundTasks):
    db = get_db()
    doc = run.model_dump()
    result = await db.test_runs.insert_one(doc)
    doc_id = str(result.inserted_id)

    # Update device last_seen
    await db.devices.update_one(
        {"device_id": run.device_id},
        {"$set": {"last_seen": datetime.utcnow(), "status": "online"}},
    )

    # Async: alert threshold check + embedding (failures only)
    background.add_task(_check_and_create_alert, run.device_id, doc_id)
    if run.status == "fail":
        background.add_task(_embed_failed_run, doc_id)

    # Notify SSE subscribers
    notify_sse(run.device_id, run.led_state, run.status, run.started_at.isoformat())

    return {"id": doc_id, "device_id": run.device_id, "led_state": run.led_state}


@router.get("/test-runs")
async def list_test_runs(
    device_id: str | None = Query(None),
    limit: int = Query(50, le=200),
):
    db = get_db()
    filt = {}
    if device_id:
        filt["device_id"] = device_id

    docs = await db.test_runs.find(filt, {"embedding": 0}).sort("started_at", -1).limit(limit).to_list(limit)

    pipeline = [
        {"$match": filt or {}},
        {"$sort": {"started_at": -1}},
        {"$limit": limit},
        {"$project": {"embedding": 0}},
    ]
    sql = (
        f"SELECT * FROM test_runs"
        + (f" WHERE device_id = '{device_id}'" if device_id else "")
        + f" ORDER BY started_at DESC LIMIT {limit}"
    )
    return {
        "data": [_serialize(d) for d in docs],
        "total": len(docs),
        "query_info": QueryInfo(
            mongodb_pipeline=pipeline,
            sql_equivalent=sql,
            index_hint="Uses index: { device_id: 1, started_at: -1 }" if device_id else "Uses index: { started_at: -1 }",
        ).model_dump(),
    }


class StartCyclePayload(BaseModel):
    device_ids: list[str]


@router.post("/fleet/start-cycle", status_code=200)
async def fleet_start_cycle(payload: StartCyclePayload):
    """Called by the simulator at the start of each test cycle to show amber state.
    Pushes an SSE amber event for each device — no database write."""
    ts = datetime.utcnow().isoformat()
    for device_id in payload.device_ids:
        notify_sse(device_id, "amber", "running", ts)
    return {"notified": len(payload.device_ids)}


@router.get("/fleet/states")
async def fleet_led_states():
    """
    Returns the most recent LED state per device — used by the fleet page to
    populate initial state on load (SSE only delivers deltas, not current state).
    MongoDB: $sort + $group to pick the latest test_run per device.
    SQL: SELECT DISTINCT ON (device_id) device_id, led_state FROM test_runs ORDER BY device_id, started_at DESC
    """
    db = get_db()
    pipeline = [
        {"$sort": {"started_at": -1}},
        {"$group": {"_id": "$device_id", "led_state": {"$first": "$led_state"}, "status": {"$first": "$status"}}},
    ]
    docs = await db.test_runs.aggregate(pipeline).to_list(100)
    return {d["_id"]: d["led_state"] for d in docs if d.get("_id")}


@router.get("/test-runs/stream")
async def stream_test_runs():
    """Server-Sent Events — pushes updates whenever a new test run is ingested."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    _sse_subscribers.append(queue)

    async def event_generator():
        try:
            yield "data: {\"connected\": true}\n\n"
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(payload)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            _sse_subscribers.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
