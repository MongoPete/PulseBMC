from fastapi import APIRouter, HTTPException
from app.db import get_db
from app.models.device import Device, DeviceCreate
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


@router.post("/devices", status_code=201)
async def create_device(device: DeviceCreate):
    db = get_db()
    existing = await db.devices.find_one({"device_id": device.device_id})
    if existing:
        raise HTTPException(status_code=409, detail="Device already exists")
    result = await db.devices.insert_one(device.model_dump())
    return {"id": str(result.inserted_id), "device_id": device.device_id}
