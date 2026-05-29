"""
Embedding service — Voyage AI voyage-4-large (1024 dims).

Responsibilities:
  - build_embedding_text(): construct natural-language summary from a test_run or alert doc
  - embed_and_update_test_run(): called as BackgroundTask after a failed test_run insert
  - embed_and_update_alert(): called after an alert is upserted

Split of responsibilities:
  - THIS module handles INGESTION-TIME embedding (storing vectors on documents).
  - QUERY-TIME embedding is handled by the MongoDB MCP server automatically via
    $vectorSearch { query: { text }, model: "voyage-4-large" } — no Python SDK call needed.
"""
import os
from datetime import datetime
from bson import ObjectId
import voyageai


_vo_client = None


def get_voyage_client() -> voyageai.Client:
    global _vo_client
    if _vo_client is None:
        _vo_client = voyageai.Client(api_key=os.environ["VOYAGE_API_KEY"])
    return _vo_client


def build_embedding_text_for_test_run(doc: dict) -> str:
    """Convert a test_run document into a dense natural-language description for embedding."""
    parts = [
        f"{doc.get('pattern_id', 'loopback')} test {doc.get('status', 'fail')} "
        f"on device {doc.get('device_id', 'unknown')}",
        f"Duration: {doc.get('duration_ms', 0)}ms",
        f"LED state: {doc.get('led_state', 'red')}",
    ]
    results = doc.get("results", {})
    for component in results.get("components", []):
        if component.get("result") == "fail":
            parts.append(
                f"Component {component['component_id']} failed "
                f"with error {component.get('error_code', 'unknown')}"
            )
    return ". ".join(parts)


def build_embedding_text_for_alert(doc: dict) -> str:
    return (
        f"Alert on device {doc.get('device_id', 'unknown')}: "
        f"{doc.get('summary', '')}. "
        f"Severity: {doc.get('severity', 'high')}. "
        f"Failure rate: {doc.get('failure_rate', 0):.1%}."
    )


async def embed_and_update_test_run(doc_id: str):
    """Fetch the test_run, generate an embedding, and update the document in-place."""
    from app.db import get_db
    db = get_db()

    doc = await db.test_runs.find_one({"_id": ObjectId(doc_id)})
    if not doc:
        return

    text = build_embedding_text_for_test_run(doc)
    vo = get_voyage_client()
    result = vo.embed(texts=[text], model="voyage-4-large", input_type="document")

    await db.test_runs.update_one(
        {"_id": ObjectId(doc_id)},
        {"$set": {
            "embedding_text": text,
            "embedding": result.embeddings[0],
            "embedding_model": "voyage-4-large",
            "embedded_at": datetime.utcnow(),
        }},
    )


async def embed_and_update_alert(alert_id: str):
    """Generate and store an embedding for an alert document."""
    from app.db import get_db
    db = get_db()

    doc = await db.alerts.find_one({"_id": ObjectId(alert_id)})
    if not doc:
        return

    text = build_embedding_text_for_alert(doc)
    vo = get_voyage_client()
    result = vo.embed(texts=[text], model="voyage-4-large", input_type="document")

    await db.alerts.update_one(
        {"_id": ObjectId(alert_id)},
        {"$set": {
            "embedding_text": text,
            "embedding": result.embeddings[0],
            "embedding_model": "voyage-4-large",
            "embedded_at": datetime.utcnow(),
        }},
    )


def embed_documents_sync(texts: list[str]) -> list[list[float]]:
    """Synchronous batch embed — used by seed script."""
    vo = get_voyage_client()
    result = vo.embed(texts=texts, model="voyage-4-large", input_type="document")
    return result.embeddings
