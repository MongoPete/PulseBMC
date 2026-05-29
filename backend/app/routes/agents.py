import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.models.agent_outputs import AgentChainResult, AgentRun, RetrievedDoc
from app.db import get_db
from datetime import datetime

router = APIRouter()


class PredictRequest(BaseModel):
    device_id: str
    time_window_hours: int = 24


class RootCauseRequest(BaseModel):
    alert_id: str


class WorkOrderRequest(BaseModel):
    alert_id: str


class ChainRequest(BaseModel):
    alert_id: str
    device_id: str | None = None
    time_window_hours: int = 24
    force_refresh: bool = False


@router.post("/agents/predict-failure")
async def predict_failure(req: PredictRequest):
    from app.agents.failure_prediction import run_failure_prediction
    prediction, tool_calls = await run_failure_prediction(req.device_id, req.time_window_hours)
    return prediction.model_dump()


@router.post("/agents/root-cause")
async def root_cause(req: RootCauseRequest):
    from app.agents.root_cause import run_root_cause
    rca, tool_calls, similar = await run_root_cause(req.alert_id)
    return rca.model_dump()


def _build_telemetry_context(run: dict | None) -> str | None:
    """Build a structured telemetry block from the latest failed test run."""
    if not run:
        return None

    lines = ["=== Hardware Telemetry Context ==="]

    failure_mode = run.get("failure_mode")
    if failure_mode:
        lines.append(f"failure_mode: {failure_mode}")

    true_fault = run.get("true_fault_source")
    if true_fault:
        lines.append(f"true_fault_source (simulator hint): {true_fault}")

    # Collect elevated core temps from failing components
    components = run.get("results", {}).get("components", [])
    for comp in components:
        if comp.get("result") != "fail":
            continue
        core_temps = [
            f"{cr['core_id']}={cr['temp_c']}°C"
            for cr in comp.get("core_results", [])
            if cr.get("temp_c") is not None
        ]
        if core_temps:
            lines.append(f"core temperatures at failure ({comp['component_id']}): {', '.join(core_temps)}")

    lines.append("healthy baseline expected: 38–62°C")

    smart = run.get("nvme_smart")
    if smart:
        lines.append(
            f"nvme_smart: media_errors={smart.get('media_errors', 0)}, "
            f"num_err_log_entries={smart.get('num_err_log_entries', 0)}, "
            f"temperature={smart.get('temperature', '?')}°C, "
            f"critical_warning={smart.get('critical_warning', 0)}"
        )

    lines.append("=== End Context ===")
    return "\n".join(lines)


def _build_device_location(device_doc: dict | None) -> str | None:
    """Build a human-readable location string from the device document."""
    if not device_doc:
        return None
    loc = device_doc.get("location", {})
    hw = device_doc.get("hardware", {})
    parts = [
        loc.get("datacenter"),
        loc.get("rack"),
        f"Slot-{loc.get('slot')}" if loc.get("slot") else None,
    ]
    location_str = " › ".join(p for p in parts if p)
    model = hw.get("model", "")
    return f"{location_str} ({model})" if model else location_str or None


@router.post("/agents/chain")
async def run_agent_chain(req: ChainRequest):
    """
    Run all three agents sequentially: predict → root cause → work order.
    Logs the full run (including retrieved documents) to agent_runs collection.
    """
    db = get_db()
    start = time.time()

    # Return cached result if this alert has already been analyzed
    if not req.force_refresh:
        cached = await db.agent_runs.find_one(
            {"triggered_by": f"alert:{req.alert_id}"},
            sort=[("created_at", -1)],
        )
        if cached:
            out = cached.get("llm_output", {})
            return {
                **out,
                "agent_run_id": str(cached["_id"]),
                "cached": True,
                "cached_at": cached.get("created_at", "").isoformat()
                             if hasattr(cached.get("created_at", ""), "isoformat") else str(cached.get("created_at", "")),
            }

    from app.agents.failure_prediction import run_failure_prediction
    from app.agents.root_cause import run_root_cause
    from app.agents.work_order import run_work_order

    # Resolve device_id from alert if not provided
    device_id = req.device_id
    if not device_id:
        from bson import ObjectId
        alert = await db.alerts.find_one({"_id": ObjectId(req.alert_id)})
        if alert:
            device_id = alert.get("device_id", "unknown")

    all_tool_calls = []
    all_retrieved_docs = []

    # Fetch latest failed test run + device doc for telemetry context
    latest_run = await db.test_runs.find_one(
        {"device_id": device_id, "status": "fail"},
        sort=[("started_at", -1)],
    )
    device_doc = await db.devices.find_one({"device_id": device_id})

    telemetry_context = _build_telemetry_context(latest_run)
    device_location = _build_device_location(device_doc)

    # Stage 1
    prediction, tc1 = await run_failure_prediction(device_id, req.time_window_hours)
    all_tool_calls.extend(tc1)

    # Stage 2
    rca, tc2, similar_incidents = await run_root_cause(req.alert_id, telemetry_context=telemetry_context)
    all_tool_calls.extend(tc2)
    for s in similar_incidents:
        all_retrieved_docs.append(RetrievedDoc(
            collection="test_runs",
            doc_id=str(s.get("_id", "")),
            similarity=s.get("score"),
            summary=s.get("embedding_text", "")[:120],
        ))

    # Stage 3
    work_order = await run_work_order(rca, similar_incidents, device_id, device_location=device_location)

    duration_ms = int((time.time() - start) * 1000)

    # Log to agent_runs
    agent_run = AgentRun(
        agent_type="chain",
        triggered_by=f"alert:{req.alert_id}",
        input_context={"alert_id": req.alert_id, "device_id": device_id},
        retrieved_documents=all_retrieved_docs,
        tool_calls=all_tool_calls,
        llm_output={
            "prediction": prediction.model_dump(),
            "root_cause": rca.model_dump(),
            "work_order": work_order.model_dump(),
        },
        duration_ms=duration_ms,
    )
    result = await db.agent_runs.insert_one(agent_run.model_dump())
    agent_run_id = str(result.inserted_id)

    return {
        **AgentChainResult(
            prediction=prediction,
            root_cause=rca,
            work_order=work_order,
            agent_run_id=agent_run_id,
        ).model_dump(),
        "cached": False,
    }


@router.get("/agents/knowledge-base")
async def knowledge_base_summary():
    """
    Aggregate patterns from all stored agent_runs to surface recurring root causes,
    at-risk components, and trend signals — the internal knowledge base view.
    """
    db = get_db()

    # Top root cause hypotheses by frequency and confidence
    rca_pipeline = [
        {"$match": {"llm_output.root_cause.root_cause_hypothesis": {"$exists": True}}},
        {"$group": {
            "_id": "$llm_output.root_cause.root_cause_hypothesis",
            "count": {"$sum": 1},
            "avg_confidence": {"$avg": "$llm_output.root_cause.confidence"},
            "devices": {"$addToSet": "$input_context.device_id"},
            "last_seen": {"$max": "$created_at"},
        }},
        {"$sort": {"count": -1, "avg_confidence": -1}},
        {"$limit": 10},
    ]
    top_hypotheses = await db.agent_runs.aggregate(rca_pipeline).to_list(10)

    # At-risk components aggregated from failure predictions
    component_pipeline = [
        {"$match": {"llm_output.prediction.at_risk_components": {"$exists": True}}},
        {"$unwind": "$llm_output.prediction.at_risk_components"},
        {"$group": {
            "_id": "$llm_output.prediction.at_risk_components.component_id",
            "appearances": {"$sum": 1},
            "avg_failure_rate": {"$avg": "$llm_output.prediction.at_risk_components.failure_rate"},
            "error_codes": {"$addToSet": {
                "$arrayElemAt": ["$llm_output.prediction.at_risk_components.error_codes", 0]
            }},
        }},
        {"$sort": {"appearances": -1}},
        {"$limit": 8},
    ]
    at_risk_components = await db.agent_runs.aggregate(component_pipeline).to_list(8)

    # Most common work order priorities
    priority_pipeline = [
        {"$match": {"llm_output.work_order.priority": {"$exists": True}}},
        {"$group": {"_id": "$llm_output.work_order.priority", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    priority_dist = await db.agent_runs.aggregate(priority_pipeline).to_list(4)

    # Total runs in knowledge base
    total = await db.agent_runs.count_documents({})
    latest = await db.agent_runs.find_one({}, sort=[("created_at", -1)])

    def clean(doc: dict) -> dict:
        doc["id"] = str(doc.pop("_id", ""))
        if hasattr(doc.get("last_seen"), "isoformat"):
            doc["last_seen"] = doc["last_seen"].isoformat()
        return doc

    return {
        "total_runs": total,
        "latest_run_at": latest["created_at"].isoformat() if latest and hasattr(latest.get("created_at"), "isoformat") else None,
        "top_hypotheses": [clean(h) for h in top_hypotheses],
        "at_risk_components": [clean(c) for c in at_risk_components],
        "priority_distribution": [{"priority": p["_id"], "count": p["count"]} for p in priority_dist],
    }


@router.get("/agents/runs/{agent_run_id}")
async def get_agent_run(agent_run_id: str):
    """Fetch the full retrieval trace for a completed agent run — powers RetrievedContextPanel."""
    from bson import ObjectId
    db = get_db()
    doc = await db.agent_runs.find_one({"_id": ObjectId(agent_run_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="Agent run not found")
    doc["id"] = str(doc.pop("_id"))
    return doc
