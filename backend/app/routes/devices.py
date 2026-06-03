from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from app.db import get_db
from app.models.device import Device, DeviceCreate, LatchRequest, ClearLatchRequest
from app.models.common import QueryInfo, PaginatedResponse
from bson import ObjectId

router = APIRouter()


def _serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id", ""))
    return doc


@router.get("/devices")
async def list_devices():
    db = get_db()
    docs = await db.devices.find({}, {"embedding": 0}).to_list(100)
    return {
        "data": [_serialize(d) for d in docs],
        "total": len(docs),
        "query_info": QueryInfo(
            mongodb_filter={},
            sql_equivalent="SELECT * FROM devices LIMIT 100",
            index_hint="Collection scan (small collection)",
        ).model_dump(),
    }


@router.get("/devices/{device_id}")
async def get_device(device_id: str):
    db = get_db()
    doc = await db.devices.find_one({"device_id": device_id}, {"embedding": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Device not found")
    return _serialize(doc)


@router.patch("/devices/{device_id}/status")
async def update_device_status(device_id: str, status: str = Query(..., pattern="^(online|offline|maintenance)$")):
    """Set device status — used by isolate/restore actions in the control plane."""
    db = get_db()
    result = await db.devices.update_one(
        {"device_id": device_id},
        {"$set": {"status": status}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"device_id": device_id, "status": status}


@router.post("/devices", status_code=201)
async def create_device(device: DeviceCreate):
    db = get_db()
    existing = await db.devices.find_one({"device_id": device.device_id})
    if existing:
        raise HTTPException(status_code=409, detail="Device already exists")
    result = await db.devices.insert_one(device.model_dump())
    return {"id": str(result.inserted_id), "device_id": device.device_id}


@router.post("/devices/{device_id}/latch", status_code=200)
async def latch_failure(device_id: str, req: LatchRequest):
    """Pin a failed core visible — stays latched until explicitly cleared."""
    db = get_db()
    # Remove any existing latch for the same component+core first (idempotent)
    await db.devices.update_one(
        {"device_id": device_id},
        {"$pull": {"latched_failures": {"component_id": req.component_id, "core_id": req.core_id}}},
    )
    latch = {
        "component_id": req.component_id,
        "core_id": req.core_id,
        "error_code": req.error_code,
        "run_id": req.run_id,
        "latched_at": datetime.utcnow().isoformat(),
    }
    result = await db.devices.update_one(
        {"device_id": device_id},
        {"$push": {"latched_failures": latch}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"device_id": device_id, "latched": latch}


@router.post("/devices/{device_id}/latch/clear", status_code=200)
async def clear_latch(device_id: str, req: ClearLatchRequest):
    """Remove a latched failure — operator confirms fault has been addressed."""
    db = get_db()
    result = await db.devices.update_one(
        {"device_id": device_id},
        {"$pull": {"latched_failures": {"component_id": req.component_id, "core_id": req.core_id}}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Device not found")
    return {"device_id": device_id, "cleared": {"component_id": req.component_id, "core_id": req.core_id}}
