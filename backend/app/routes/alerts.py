from fastapi import APIRouter, Query
from app.db import get_db
from app.models.common import QueryInfo

router = APIRouter()


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id", ""))
    doc.pop("embedding", None)
    return doc


@router.get("/alerts")
async def list_alerts(status: str = Query("open")):
    db = get_db()
    filt = {"status": status}
    docs = await db.alerts.find(filt, {"embedding": 0}).sort("triggered_at", -1).to_list(100)

    pipeline = [
        {"$match": filt},
        {"$sort": {"triggered_at": -1}},
    ]
    return {
        "data": [_serialize(d) for d in docs],
        "total": len(docs),
        "query_info": QueryInfo(
            mongodb_pipeline=pipeline,
            sql_equivalent=f"SELECT * FROM alerts WHERE status = '{status}' ORDER BY triggered_at DESC",
            index_hint="Uses index: { device_id: 1, status: 1, triggered_at: -1 }",
        ).model_dump(),
    }


@router.patch("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    from bson import ObjectId
    db = get_db()
    await db.alerts.update_one(
        {"_id": ObjectId(alert_id)},
        {"$set": {"status": "acknowledged"}},
    )
    return {"status": "acknowledged"}
