"""
find_similar_failures — RAG tool.

Embeds the query with Voyage AI (Python SDK), then runs $vectorSearch
directly via Motor — no MCP subprocess dependency.
"""
import os
import voyageai
from langchain_core.tools import tool
from app.db import get_db


def _get_voyage_client() -> voyageai.Client:
    return voyageai.Client(api_key=os.environ["VOYAGE_API_KEY"])


@tool
async def find_similar_failures(description: str, device_id: str = "", limit: int = 5) -> list[dict]:
    """
    Find historically similar hardware test failures via Atlas Vector Search.

    Use this when investigating a new failure to learn from past incidents.
    The search is semantic — it finds similar failures even if error codes differ.

    Args:
        description: Natural language description of the failure to search for
        device_id: Optional — restrict search to a specific device
        limit: Number of similar failures to return (default 5)
    """
    # 1. Embed query via Voyage AI Python SDK
    client = _get_voyage_client()
    result = client.embed([description], model="voyage-4-large", input_type="query")
    query_vector = result.embeddings[0]

    # 2. Build $vectorSearch pipeline with pre-computed vector
    match_filter: dict = {"status": "fail"}
    if device_id:
        match_filter["device_id"] = device_id

    pipeline = [
        {
            "$vectorSearch": {
                "index": "test_runs_vector_idx",
                "path": "embedding",
                "queryVector": query_vector,
                "numCandidates": 100,
                "limit": limit,
                "filter": match_filter,
            }
        },
        {
            "$project": {
                "device_id": 1,
                "pattern_id": 1,
                "started_at": 1,
                "duration_ms": 1,
                "led_state": 1,
                "embedding_text": 1,
                "results.components": 1,
                "score": {"$meta": "vectorSearchScore"},
            }
        },
    ]

    db = get_db()
    docs = await db.test_runs.aggregate(pipeline).to_list(limit)

    # Normalize _id to string
    for doc in docs:
        if "_id" in doc:
            doc["_id"] = str(doc["_id"])

    return docs
