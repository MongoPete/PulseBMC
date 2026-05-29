"""
Stage 2 — Root Cause Analysis Agent

Uses RAG (Atlas Vector Search) to retrieve similar past failures
and synthesize a ranked root cause hypothesis.
"""
import time
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from app.models.agent_outputs import RootCauseAnalysis
from app.tools.find_similar_failures import find_similar_failures
from app.services.llm import get_llm
from app.db import get_db
from bson import ObjectId

SYSTEM_PROMPT = """You are a root cause analyst for in-system hardware tests.
Given an alert and retrieved similar past failures, determine the most likely root cause.

Output valid JSON matching this schema:
{{
  "root_cause_hypothesis": "string",
  "evidence": ["string"],
  "confidence": 0.0-1.0,
  "alternative_hypotheses": ["string"],
  "next_diagnostic_steps": ["string"],
  "retrieved_context_summary": "string — e.g. Found 5 similar past failures, 4 resolved with PCIe reseat"
}}

Be conservative. Cite the retrieved incidents by ID. If multiple hypotheses are equally likely, list them."""


async def run_root_cause(alert_id: str) -> tuple[RootCauseAnalysis, list, list]:
    start_time = time.time()
    db = get_db()
    tool_calls_log = []

    # Fetch the alert
    alert = await db.alerts.find_one({"_id": ObjectId(alert_id)})
    if not alert:
        return RootCauseAnalysis(
            alert_id=alert_id,
            root_cause_hypothesis="Alert not found",
            evidence=[],
            confidence=0.0,
            alternative_hypotheses=[],
            next_diagnostic_steps=[],
        ), [], []

    # RAG: find similar past failures via Atlas Vector Search
    description = alert.get("summary", f"Hardware failure alert on {alert.get('device_id')}")
    similar = await find_similar_failures.ainvoke({"description": description, "limit": 7})
    tool_calls_log.append({
        "tool": "find_similar_failures",
        "args": {"description": description[:80]},
        "result_count": len(similar),
    })

    # Fetch device metadata directly via Motor
    device_info = {}
    device_doc = await db.devices.find_one({"device_id": alert.get("device_id")})
    if device_doc:
        device_info = device_doc
        tool_calls_log.append({"tool": "devices.find_one", "args": {"device_id": alert.get("device_id")}, "result_count": 1})

    # Build context for LLM
    similar_summaries = "\n".join([
        f"- ID {s.get('_id', 'unknown')}: {s.get('embedding_text', '')} (similarity: {s.get('score', 0):.2f})"
        for s in similar[:5]
    ])

    # Pull top past RCA conclusions from agent_runs knowledge base to inform this analysis
    past_rcas = await db.agent_runs.find(
        {
            "llm_output.root_cause.root_cause_hypothesis": {"$exists": True},
            "triggered_by": {"$ne": f"alert:{alert_id}"},  # exclude this alert's own prior runs
        },
        {
            "llm_output.root_cause.root_cause_hypothesis": 1,
            "llm_output.root_cause.confidence": 1,
            "llm_output.root_cause.evidence": 1,
            "input_context.device_id": 1,
            "created_at": 1,
        },
    ).sort("llm_output.root_cause.confidence", -1).limit(5).to_list(5)

    kb_context = ""
    if past_rcas:
        lines = []
        for r in past_rcas:
            rca_out = r.get("llm_output", {}).get("root_cause", {})
            conf = rca_out.get("confidence", 0)
            hyp = rca_out.get("root_cause_hypothesis", "")
            device = r.get("input_context", {}).get("device_id", "unknown")
            lines.append(f"- [{device}, confidence={conf:.0%}] {hyp}")
        kb_context = "\nKnowledge base — top past RCA conclusions:\n" + "\n".join(lines)

    # Format location without curly braces so LangChain doesn't treat it as a template variable
    loc = device_info.get("location", {})
    location_str = ", ".join(f"{k}={v}" for k, v in loc.items()) if loc else "unknown"

    human_text = (
        f"Alert: {description}\n"
        f"Device: {alert.get('device_id')} at {location_str}\n"
        f"Failure rate: {alert.get('failure_rate', 0):.1%}\n\n"
        f"Retrieved similar past failures:\n{similar_summaries or 'None found'}\n"
        f"{kb_context}\n"
        "Provide root cause analysis as JSON."
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", human_text),
    ])

    llm = get_llm()
    chain = prompt | llm | JsonOutputParser()
    llm_output = await chain.ainvoke({})

    rca = RootCauseAnalysis(
        alert_id=alert_id,
        root_cause_hypothesis=llm_output.get("root_cause_hypothesis", ""),
        evidence=llm_output.get("evidence", []),
        confidence=llm_output.get("confidence", 0.5),
        alternative_hypotheses=llm_output.get("alternative_hypotheses", []),
        next_diagnostic_steps=llm_output.get("next_diagnostic_steps", []),
        retrieved_context_summary=llm_output.get("retrieved_context_summary", f"Retrieved {len(similar)} similar past failures"),
    )
    return rca, tool_calls_log, similar
