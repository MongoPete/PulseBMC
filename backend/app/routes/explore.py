"""
Natural Language Explorer — Aaron types a question, gets data + the MongoDB
query that produced it + a SQL equivalent, so he can build intuition.
"""
import time
from datetime import datetime, timedelta
from fastapi import APIRouter
from pydantic import BaseModel
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from app.services.llm import get_llm
from app.db import get_db

router = APIRouter()

SYSTEM_PROMPT = """You are a MongoDB query expert for the SoCPulse hardware monitoring system.

## Database: pulse_bmc

### Collection: test_runs
Fields (with types):
  device_id       String   — e.g. "device-015"
  pattern_id      String   — e.g. "loopback_v1"
  started_at      String   — ISO 8601 UTC, e.g. "2026-05-29T14:30:00.000000"
  status          String   — "pass" | "fail"
  led_state       String   — "green" | "red" | "amber"
  duration_ms     Number   — test duration in milliseconds
  failure_mode    String   — "none" | "intermittent" | "sticky" | "silent"
  results         Object
    overall       String   — "pass" | "fail"
    components    Array of objects:
      component_id   String   — e.g. "pcie_card_1"
      result         String   — "pass" | "fail"
      error_code     String   — e.g. "LB_TIMEOUT", may be null
      corruption_detected Boolean — may be absent

Indexes: { "device_id": 1, "started_at": -1 } (compound, primary for time range queries)

### Collection: devices
Fields:
  device_id       String   — unique
  hostname        String
  status          String   — "online" | "maintenance" | "offline" | "degrading"
  location        Object   — rack, server, datacenter, pcie_slot
  hardware        Object   — cpu_model, memory_gb, etc.
  last_seen       String   — ISO 8601

### Collection: alerts
Fields:
  device_id       String
  summary         String
  severity        String   — "low" | "medium" | "high" | "critical"
  status          String   — "open" | "acknowledged" | "resolved"
  triggered_at    String   — ISO 8601
  failure_rate    Number   — 0.0 to 1.0

## CRITICAL QUERY RULES

### Date filtering — NEVER use $expr or $dateSubtract
started_at is stored as an ISO 8601 string. Compare it directly with a precomputed ISO string:

CORRECT:
  { "$match": { "started_at": { "$gte": "2026-05-28T14:30:00.000000" } } }

WRONG — do not do this:
  { "$match": { "$expr": { "$gte": ["$started_at", { "$dateSubtract": ... }] } } }

The current UTC time is provided in each request. Use it to compute date thresholds yourself.

### Use direct field operators, not $expr, for simple comparisons
CORRECT:  { "$match": { "status": "fail", "started_at": { "$gte": "..." } } }
WRONG:    { "$match": { "$expr": { "$and": [...] } } }
Only use $expr when you genuinely need to compare two document fields to each other.

### Prefer $match early in pipelines
Put $match before $unwind, $group, and $project to use indexes and reduce document scans.

### Nested array queries — use $elemMatch (not $search)
To filter on array elements:
  { "results.components": { "$elemMatch": { "component_id": "pcie_card_1", "result": "fail" } } }
This is a structured filter, not a text search — do not use $search for it.

### When to use $search (Atlas Search)
Only use $search as the first stage when the user is doing free-text or keyword search
across multiple string fields (e.g. "find alerts mentioning thermal"). For structured
filters on known field values, use $match.

### Aggregation pipeline stage order
Optimal order: $match → $sort → $limit → $unwind → $group → $project
Always apply $match + $sort on indexed fields before $unwind or $group.

## OUTPUT FORMAT
Return ONLY a valid JSON object with exactly these fields:
  collection      String  — collection name
  operation       String  — "find" or "aggregate"
  pipeline        Array   — aggregation stages (use for grouping, facets, nested unwinds), or null
  filter          Object  — simple find filter (for plain lookups without grouping), or null
  projection      Object  — fields to include/exclude, or null
  sort            Object  — sort spec, or null
  limit           Number  — max results, or null
  sql_equivalent  String  — equivalent SQL
  answer_template String  — one sentence summary; use RESULT as placeholder for count/value

No explanation outside the JSON."""



class ExploreRequest(BaseModel):
    question: str


@router.get("/explore/facets")
async def explore_facets():
    """
    Returns live Atlas statistics using a single $facet aggregation per collection.
    Demonstrates MongoDB's ability to run multiple aggregations in one round-trip.
    """
    db = get_db()
    since_24h = (datetime.utcnow() - timedelta(hours=24)).isoformat()
    since_7d = (datetime.utcnow() - timedelta(days=7)).isoformat()

    # $facet: 5 aggregations in 1 query against test_runs
    pipeline = [
        {"$facet": {
            "recent_fails_24h": [
                {"$match": {"status": "fail", "started_at": {"$gte": since_24h}}},
                {"$count": "n"},
            ],
            "failure_modes_7d": [
                {"$match": {"status": "fail", "started_at": {"$gte": since_7d}, "failure_mode": {"$ne": None}}},
                {"$group": {"_id": "$failure_mode", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
            ],
            "top_failing_devices_24h": [
                {"$match": {"status": "fail", "started_at": {"$gte": since_24h}}},
                {"$group": {"_id": "$device_id", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 5},
            ],
            "pass_vs_fail_24h": [
                {"$match": {"started_at": {"$gte": since_24h}}},
                {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            ],
        }},
    ]

    facet_result = await db.test_runs.aggregate(pipeline).next()

    device_total = await db.devices.count_documents({})
    device_degrading = await db.devices.count_documents({"status": "degrading"})
    open_alerts = await db.alerts.count_documents({"status": "open"})

    recent_fails = facet_result["recent_fails_24h"][0]["n"] if facet_result["recent_fails_24h"] else 0
    failure_modes = [{"mode": d["_id"] or "unknown", "count": d["count"]} for d in facet_result["failure_modes_7d"]]
    top_devices = [{"device_id": d["_id"], "count": d["count"]} for d in facet_result["top_failing_devices_24h"]]
    pvf = {d["_id"]: d["count"] for d in facet_result["pass_vs_fail_24h"]}

    return {
        "devices": {"total": device_total, "degrading": device_degrading},
        "alerts": {"open": open_alerts},
        "recent_fails_24h": recent_fails,
        "pass_24h": pvf.get("pass", 0),
        "fail_24h": pvf.get("fail", 0),
        "failure_modes_7d": failure_modes,
        "top_failing_devices_24h": top_devices,
        "meta": {
            "mongodb_note": "$facet ran 4 aggregation branches in 1 round-trip against test_runs",
        },
    }


@router.post("/explore/query")
async def explore_query(req: ExploreRequest):
    db = get_db()
    start = time.time()

    # Translate natural language → MongoDB query via LLM
    # Inject current UTC time so the LLM can compute ISO date thresholds directly
    # instead of using $expr/$dateSubtract at runtime.
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.000000")
    human_msg = (
        f"Current UTC time: {now_iso}\n\n"
        f"Question: {req.question}"
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "{question}"),
    ])
    chain = prompt | get_llm() | JsonOutputParser()  # type: ignore[operator]

    try:
        plan = await chain.ainvoke({"question": human_msg})
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
