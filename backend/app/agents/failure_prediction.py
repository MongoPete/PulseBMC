"""
Stage 1 — Failure Prediction Agent

Identifies components trending toward failure using Motor aggregation + RAG retrieval.
"""
import time
from datetime import datetime, timedelta, timezone
from app.models.agent_outputs import FailurePrediction, AtRiskComponent
from app.tools.find_similar_failures import find_similar_failures
from app.db import get_db


async def run_failure_prediction(device_id: str, time_window_hours: int = 24) -> tuple[FailurePrediction, list]:
    start_time = time.time()
    db = get_db()
    tool_calls_log = []

    window_start = datetime.now(timezone.utc) - timedelta(hours=time_window_hours)

    # Compute failure rates per component via Motor aggregation
    pipeline = [
        {"$match": {"device_id": device_id, "started_at": {"$gte": window_start.isoformat()}}},
        {"$unwind": "$results.components"},
        {"$group": {
            "_id": "$results.components.component_id",
            "total": {"$sum": 1},
            "failures": {"$sum": {"$cond": [{"$eq": ["$results.components.result", "fail"]}, 1, 0]}},
            "error_codes": {"$addToSet": "$results.components.error_code"},
        }},
        {"$addFields": {"failure_rate": {"$divide": ["$failures", "$total"]}}},
        {"$sort": {"failure_rate": -1}},
    ]

    component_stats = await db.test_runs.aggregate(pipeline).to_list(50)
    tool_calls_log.append({
        "tool": "aggregate",
        "args": {"pipeline": "failure_rate_by_component", "device_id": device_id},
        "result_count": len(component_stats),
    })

    # For at-risk components, retrieve similar past failures via RAG
    at_risk = []
    for stat in component_stats:
        if stat.get("failure_rate", 0) <= 0.10:
            continue
        component_id = stat.get("_id", "unknown")
        error_codes = [e for e in (stat.get("error_codes") or []) if e]

        similar = await find_similar_failures.ainvoke({
            "description": f"{component_id} loopback failure on device {device_id}, error codes: {', '.join(error_codes)}",
            "limit": 5,
        })
        tool_calls_log.append({
            "tool": "find_similar_failures",
            "args": {"component_id": component_id},
            "result_count": len(similar),
        })

        at_risk.append(AtRiskComponent(
            component_id=component_id,
            failure_rate=stat.get("failure_rate", 0),
            error_codes=error_codes,
            similar_incident_ids=[str(s.get("_id", "")) for s in similar if s.get("_id")],
        ))

    confidence = min(0.95, 0.5 + len(at_risk) * 0.15) if at_risk else 0.2
    evidence = [
        f"Component {c.component_id}: {c.failure_rate:.1%} failure rate over {time_window_hours}h window"
        for c in at_risk
    ]
    if not at_risk:
        evidence = [f"No components exceed 10% failure rate in the last {time_window_hours}h"]

    prediction = FailurePrediction(
        device_id=device_id,
        at_risk_components=at_risk,
        confidence_score=confidence,
        supporting_evidence=evidence,
        recommended_action="Schedule loopback test re-run and inspect PCIe card seating" if at_risk else "Continue monitoring",
    )
    return prediction, tool_calls_log
