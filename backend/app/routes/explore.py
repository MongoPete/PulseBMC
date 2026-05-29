"""
Natural Language Explorer — Aaron types a question, gets data + the MongoDB
query that produced it + a SQL equivalent, so he can build intuition.
"""
import os
import time
from fastapi import APIRouter
from pydantic import BaseModel
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from app.services.llm import get_llm
from app.db import get_db

router = APIRouter()

SYSTEM_PROMPT = """You are a MongoDB query expert for the PulseBMC hardware monitoring system.

Database: pulse_bmc
Collections:
- devices: device_id, hostname, location, hardware, status, last_seen
- test_runs: device_id, pattern_id, started_at, status (pass/fail), led_state (green/red), duration_ms, results.components array with component_id/result/error_code
- alerts: device_id, summary, severity, status (open/acknowledged/resolved), triggered_at, failure_rate

Given a natural language question, return a JSON object with exactly these fields:
  collection: collection name to query
  operation: "find" or "aggregate"
  pipeline: array of MongoDB aggregation stages, or null
  filter: MongoDB filter document, or null
  projection: MongoDB projection, or null
  sort: MongoDB sort, or null
  limit: number or null
  sql_equivalent: equivalent SQL query as a string
  answer_template: one sentence describing what the result represents, use RESULT as placeholder

Return ONLY valid JSON. No explanation outside the JSON."""



class ExploreRequest(BaseModel):
    question: str


@router.post("/explore/query")
async def explore_query(req: ExploreRequest):
    db = get_db()
    start = time.time()

    # Translate natural language → MongoDB query via LLM
    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "{question}"),
    ])
    chain = prompt | get_llm() | JsonOutputParser()  # type: ignore[operator]

    try:
        plan = await chain.ainvoke({"question": req.question})
    except Exception as e:
        return {"error": f"Could not parse question: {str(e)}", "data": [], "query_info": {}}

    collection = plan.get("collection", "test_runs")
    operation = plan.get("operation", "find")
    coll = db[collection]

    # Execute the generated query
    data = []
    try:
        if operation == "aggregate" and plan.get("pipeline"):
            cursor = coll.aggregate(plan["pipeline"])
            raw = await cursor.to_list(50)
        else:
            filt = plan.get("filter") or {}
            proj = plan.get("projection") or {"embedding": 0}
            sort_doc = plan.get("sort") or {"_id": -1}
            limit = min(plan.get("limit") or 20, 50)
            cursor = coll.find(filt, proj).sort(list(sort_doc.items())).limit(limit)
            raw = await cursor.to_list(limit)

        # Serialize ObjectIds
        for doc in raw:
            doc["_id"] = str(doc.get("_id", ""))
            doc.pop("embedding", None)
            data.append(doc)
    except Exception as e:
        return {"error": f"Query execution failed: {str(e)}", "data": [], "query_info": plan}

    duration_ms = int((time.time() - start) * 1000)

    # Build plain-English summary
    summary_template = plan.get("answer_template", "Found RESULT result(s).")
    summary = summary_template.replace("RESULT", str(len(data)))
    if data and len(data) == 1:
        first = data[0]
        for key in ["device_id", "hostname", "summary", "failure_rate"]:
            if key in first:
                summary = summary_template.replace("RESULT", str(first[key]))
                break

    return {
        "question": req.question,
        "natural_language_summary": summary,
        "data": data,
        "total": len(data),
        "duration_ms": duration_ms,
        "query_info": {
            "collection": collection,
            "operation": operation,
            "mongodb_pipeline": plan.get("pipeline"),
            "mongodb_filter": plan.get("filter"),
            "sql_equivalent": plan.get("sql_equivalent", ""),
            "index_hint": "Compound index used where available",
        },
    }
