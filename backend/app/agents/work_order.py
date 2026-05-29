"""
Stage 3 — Work Order Generation Agent

Uses the root cause analysis + retrieved similar incidents to generate
a prioritized, traceable repair work order.
"""
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from app.models.agent_outputs import RootCauseAnalysis, WorkOrder
from app.services.llm import get_llm

SYSTEM_PROMPT = """You generate hardware repair work orders from root cause analyses.

Input includes the root cause hypothesis AND retrieved similar past incidents.
Use the similar incidents to inform repair steps and duration estimates.

Output valid JSON matching this schema:
{{
  "title": "string — concise, includes device + component",
  "priority": "P1|P2|P3|P4",
  "assigned_technician": "string",
  "repair_steps": ["ordered string steps"],
  "estimated_duration_minutes": number,
  "required_parts": ["string"],
  "safety_notes": ["string"],
  "historical_basis": "string — e.g. Based on 5 similar incidents, 4 resolved with PCIe reseat"
}}

Constraints:
- DESTRUCTIVE TEST WARNING: flag any step that requires taking the card offline.
- Do not invent part numbers — write "TBD - lookup required".
- P1 = immediate risk to operations, P4 = low priority cosmetic."""


async def run_work_order(
    rca: RootCauseAnalysis,
    similar_incidents: list[dict],
    device_id: str,
) -> WorkOrder:
    similar_summaries = "\n".join([
        f"- {s.get('embedding_text', '')} (similarity: {s.get('score', 0):.2f})"
        for s in similar_incidents[:5]
    ])

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", (
            f"Device: {device_id}\n"
            f"Root cause: {rca.root_cause_hypothesis}\n"
            f"Confidence: {rca.confidence:.0%}\n"
            f"Evidence: {'; '.join(rca.evidence[:3])}\n\n"
            f"Similar past incidents that informed this analysis:\n{similar_summaries or 'None'}\n\n"
            "Generate the work order as JSON."
        )),
    ])

    llm = get_llm()
    chain = prompt | llm | JsonOutputParser()
    output = await chain.ainvoke({})

    return WorkOrder(
        title=output.get("title", f"Hardware repair — {device_id}"),
        priority=output.get("priority", "P2"),
        assigned_technician=output.get("assigned_technician", "On-call hardware technician"),
        repair_steps=output.get("repair_steps", []),
        estimated_duration_minutes=output.get("estimated_duration_minutes", 30),
        required_parts=output.get("required_parts", []),
        safety_notes=output.get("safety_notes", ["DESTRUCTIVE TEST: card will go offline during loopback test"]),
        historical_basis=output.get("historical_basis", rca.retrieved_context_summary),
        originating_alert_id=rca.alert_id,
        test_run_ids=[],
        retrieved_incident_ids=[str(s.get("_id", "")) for s in similar_incidents if s.get("_id")],
    )
