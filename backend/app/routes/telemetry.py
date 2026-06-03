from fastapi import APIRouter, Query
from app.db import get_db
from app.models.telemetry import TelemetryCreate
from app.models.common import QueryInfo
from pymongo import ASCENDING, DESCENDING

router = APIRouter()


@router.post("/telemetry", status_code=201)
async def ingest_telemetry(payload: TelemetryCreate):
    """
    Ingest a sensor reading into the time-series collection.
    Called by the simulator once per device per cycle.

    MongoDB: insert into time-series collection (automatic bucketing by ts)
    SQL equivalent: INSERT INTO telemetry (ts, device_id, sensor_type, readings...) VALUES (...)
    """
    db = get_db()
    doc = payload.model_dump()
    await db.telemetry.insert_one(doc)
    return {"ok": True}


@router.get("/telemetry/{device_id}")
async def get_telemetry(
    device_id: str,
    sensor_type: str = Query("thermal"),
    limit: int = Query(60, le=300),
):
    """
    Return the most recent sensor readings for a device, ascending for charting.

    MongoDB: time-series query on secondary index { meta.device_id, ts }
    SQL equivalent: SELECT ts, readings FROM telemetry
                    WHERE device_id = ? AND sensor_type = ?
                    ORDER BY ts DESC LIMIT ?
    """
    db = get_db()
    filt = {"meta.device_id": device_id, "meta.sensor_type": sensor_type}

    docs = (
        await db.telemetry.find(filt, {"_id": 0, "ts": 1, "readings": 1})
        .sort("ts", DESCENDING)
        .limit(limit)
        .to_list(limit)
    )
    docs.reverse()  # ascending order for frontend charting

    # Normalize datetime to ISO string for JSON serialisation
    for doc in docs:
        if hasattr(doc.get("ts"), "isoformat"):
            doc["ts"] = doc["ts"].isoformat()

    return {
        "data": docs,
        "total": len(docs),
        "query_info": QueryInfo(
            mongodb_filter=filt,
            sql_equivalent=(
                f"SELECT ts, readings FROM telemetry "
                f"WHERE device_id = '{device_id}' AND sensor_type = '{sensor_type}' "
                f"ORDER BY ts DESC LIMIT {limit}"
            ),
            index_hint="Uses index: { meta.device_id: 1, ts: -1 } on time-series collection",
        ).model_dump(),
    }
