import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING

_client: AsyncIOMotorClient | None = None
DB_NAME = "pulse_bmc"


def get_client() -> AsyncIOMotorClient:
    global _client
    if _client is None:
        uri = os.environ["ATLAS_URI"]
        _client = AsyncIOMotorClient(uri)
    return _client


def get_db():
    return get_client()[DB_NAME]


async def ensure_indexes():
    db = get_db()

    # test_runs — compound indexes for high-write-throughput hot path
    await db.test_runs.create_index([("device_id", ASCENDING), ("started_at", DESCENDING)])
    await db.test_runs.create_index([("status", ASCENDING), ("started_at", DESCENDING)])
    await db.test_runs.create_index(
        [("results.components.component_id", ASCENDING), ("started_at", DESCENDING)]
    )

    # alerts
    await db.alerts.create_index(
        [("device_id", ASCENDING), ("status", ASCENDING), ("triggered_at", DESCENDING)]
    )

    # test_patterns
    await db.test_patterns.create_index([("tags", ASCENDING)])

    # agent_runs
    await db.agent_runs.create_index([("agent_type", ASCENDING), ("created_at", DESCENDING)])

    # Atlas Vector Search indexes — created via raw command (Motor doesn't have a typed helper)
    # These are idempotent; Atlas silently skips if the index already exists.
    try:
        await db.command({
            "createSearchIndexes": "test_runs",
            "indexes": [{
                "name": "test_runs_vector_idx",
                "type": "vectorSearch",
                "definition": {
                    "fields": [
                        {"type": "vector", "path": "embedding", "numDimensions": 1024, "similarity": "cosine"},
                        {"type": "filter", "path": "device_id"},
                        {"type": "filter", "path": "status"},
                        {"type": "filter", "path": "started_at"},
                    ]
                }
            }]
        })
    except Exception:
        pass  # Index already exists or Atlas tier doesn't support it on M0 free tier

    try:
        await db.command({
            "createSearchIndexes": "alerts",
            "indexes": [{
                "name": "alerts_vector_idx",
                "type": "vectorSearch",
                "definition": {
                    "fields": [
                        {"type": "vector", "path": "embedding", "numDimensions": 1024, "similarity": "cosine"},
                        {"type": "filter", "path": "device_id"},
                        {"type": "filter", "path": "status"},
                    ]
                }
            }]
        })
    except Exception:
        pass


async def close_client():
    global _client
    if _client:
        _client.close()
        _client = None
