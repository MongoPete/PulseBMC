"""
Natural Language Explorer — Aaron types a question, gets data + the MongoDB
query that produced it + a SQL equivalent, so he can build intuition.
"""
import json
import re
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
  failure_mode    String   — "intermittent" | "sticky" | "silent" | null (absent = normal)
  true_fault_source String — upstream PCIe controller implicated, e.g. "upstream_pcie_controller_A"
  nvme_smart      Object   — NVMe SMART counters from BMC storage
    media_errors  Number   — accumulated media error count
    temperature   Number   — drive temperature °C
    num_err_log_entries Number
  nvme_errors     Array    — NVMe error log entries (present on failed runs)
  results         Object
    overall       String   — "pass" | "fail"
    components    Array of objects:
      component_id   String   — e.g. "pcie_card_1", "pcie_card_2", "pcie_card_3"
      result         String   — "pass" | "fail"
      error_code     String   — "LB_TIMEOUT" | "CONTINUITY_FAIL" | "LOOPBACK_FAIL_TIMING" | "SIGNAL_INTEGRITY_ERR"
      corruption_detected Boolean — silent CRC corruption (test may still pass)
      core_results   Array   — per-core IST results (instead of JOIN to child table):
        core_id      String   — "core_0" … "core_3"
        result       String   — "pass" | "fail"
        latency_ms   Number   — loopback round-trip latency
        temp_c       Number   — core temperature °C (predictive signal before LED change)

### Collection: devices
Fields:
  device_id       String   — unique
  hostname        String
  status          String   — "online" | "maintenance" | "offline" | "degrading"
  location        Object   — datacenter, rack, slot (embedded — no JOIN to locations table)
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

## AVAILABLE INDEXES (design every query to use these)

test_runs (classic):
  {{ device_id: 1, started_at: -1 }}           — per-device time-range queries
  {{ status: 1, started_at: -1 }}              — fleet-wide pass/fail over time
  {{ "results.components.component_id": 1, started_at: -1 }}  — component-scoped queries
alerts (classic):
  {{ device_id: 1, status: 1, triggered_at: -1 }}
alerts (Atlas Search — lexical):
  alerts_lexical_idx  — summary: string (full-text); status/severity/device_id: token (exact match)
test_runs (Atlas Search — vector, for semantic similarity only):
  test_runs_vector_idx  — path: embedding (do NOT use for keyword/explorer queries)

## PERFORMANCE: Operator Selection (follow this decision tree)

### Tier 1 — Indexed equality (FASTEST — always prefer)
Use find/aggregate $match with exact equality or $in on known enum values:
  status, device_id, pattern_id, failure_mode, led_state, error_code, component_id, severity
CORRECT:  {{ "status": "fail", "device_id": "device-007" }}
CORRECT:  {{ "results.components": {{ "$elemMatch": {{ "component_id": "pcie_card_1", "error_code": "LB_TIMEOUT" }} }} }}
WRONG:    {{ "error_code": {{ "$regex": "LB_TIMEOUT" }} }}   — never regex exact enums

### Tier 2 — Indexed range comparisons (after Tier 1 filters)
  started_at: {{ "$gte": "<precomputed-ISO>" }}  — pairs with device_id or status index
  duration_ms, nvme_smart.media_errors, core_results.temp_c — use $gt/$gte numerically
Date filtering — NEVER use $expr or $dateSubtract. Precompute ISO thresholds from the
current UTC time provided in each request:
CORRECT:  {{ "$match": {{ "started_at": {{ "$gte": "2026-05-28T14:30:00.000000" }} }} }}
WRONG:    {{ "$expr": {{ "$gte": ["$started_at", {{ "$dateSubtract": ... }}] }} }}

### Tier 3 — Atlas Search $search (for free-text — NOT $regex)
Use $search as the FIRST pipeline stage when the user wants:
  - Keyword/substring search in alert summaries ("mentions loopback", "contains threshold")
  - Case-insensitive text across string fields
  - Multi-field text matching with relevance scoring
CORRECT (alerts keyword search + structured filters):
  [
    {{ "$search": {{
        "index": "alerts_lexical_idx",
        "text": {{ "query": "loopback threshold", "path": "summary" }}
    }} }},
    {{ "$match": {{ "status": "open", "triggered_at": {{ "$gte": "<precomputed-ISO>" }} }} }},
    {{ "$limit": 20 }}
  ]
Use $search ONLY for full-text on summary. Apply status/severity/device_id/time filters
in a $match stage AFTER $search (uses classic index {{ device_id, status, triggered_at }}).
Do NOT use compound.equals on status unless the field is token-typed in the index.
Do NOT use $regex or legacy $text for alert keyword search.

### Tier 4 — $regex (LAST RESORT only)
Use $regex ONLY when ALL are true:
  1. No exact enum value is known
  2. No Atlas Search index covers the field
  3. Pattern match is genuinely required on an unindexed string
If unavoidable: prefer left-anchored /^prefix/ and ALWAYS narrow with indexed $match first.

### NEVER use
  $where          — blocks all index usage
  $text           — no text indexes exist; use Atlas $search instead
  $regex          — on enum fields (status, error_code, device_id, pattern_id, failure_mode)
  Redundant $exists when equality already implies the field is present

## Query shape rules

Prefer find over aggregation when the request is filter + sort + limit only.
Use aggregation only for $group, $facet, $lookup, $unwind, or multi-stage transforms.

Pipeline stage order (aggregation):
  $search (if needed) → $match (indexed fields) → $sort → $limit → $unwind → $group → $project
Put $match on device_id, status, or started_at BEFORE $unwind/$group to use indexes.
$project at end; always exclude embedding. Default limit 20, max 50.

Projection rules — CRITICAL (MongoDB error 31253 if violated):
  NEVER mix inclusion (field: 1) and exclusion (field: 0) in the same projection.
  Use inclusion-only (list desired fields) OR exclusion-only (e.g. {{"embedding": 0}}).
  _id is the only field allowed with value 0 alongside inclusions.
  CORRECT inclusion: {{"device_id": 1, "started_at": 1, "status": 1, "_id": 0}}
  WRONG mixed:      {{"device_id": 1, "embedding": 0}}  — causes execution failure

Nested array filters — use $elemMatch (structured, index-friendly):
  {{ "results.components": {{ "$elemMatch": {{ "component_id": "pcie_card_1", "result": "fail" }} }} }}
Do NOT use $search for structured component/core filters — $elemMatch is correct and faster.

## OUTPUT FORMAT
Return ONLY a valid JSON object with exactly these fields:
  collection      String  — collection name
  operation       String  — "find" or "aggregate"
  pipeline        Array   — aggregation stages, or null
  filter          Object  — simple find filter, or null
  projection      Object  — fields to include/exclude, or null
  sort            Object  — sort spec, or null
  limit           Number  — max results, or null
  sql_equivalent  String  — equivalent SQL
  answer_template String  — one sentence summary; use RESULT as placeholder for count/value
  query_strategy  String  — one of: "indexed-equality" | "indexed-range" | "atlas-search" | "aggregation" | "regex-fallback"

No explanation outside the JSON."""



class ExploreRequest(BaseModel):
    question: str


_INDEXED_FIELDS = frozenset({"device_id", "status", "started_at", "pattern_id", "failure_mode"})
_SEARCH_FILTER_FIELDS = frozenset({"status", "severity", "device_id"})


def _normalize_projection(projection: dict | None) -> dict:
    """
    MongoDB rejects mixing inclusion (field: 1) and exclusion (field: 0) in one projection
    (error 31253). The LLM often emits {device_id: 1, ..., embedding: 0} — convert to
    inclusion-only and rely on post-fetch embedding removal.
    """
    if not projection:
        return {"embedding": 0}

    inclusions = {k: v for k, v in projection.items() if v in (1, True)}
    exclusions = {k: v for k, v in projection.items() if v in (0, False) and k != "_id"}

    if inclusions and exclusions:
        normalized = dict(inclusions)
        if projection.get("_id") in (0, False):
            normalized["_id"] = 0
        return normalized

    return dict(projection)


def _normalize_pipeline_projections(pipeline: list) -> list:
    """Fix invalid mixed $project stages in aggregation pipelines."""
    normalized: list = []
    for stage in pipeline:
        if isinstance(stage, dict) and "$project" in stage:
            normalized.append({"$project": _normalize_projection(stage["$project"])})
        else:
            normalized.append(stage)
    return normalized


def _normalize_search_pipeline(pipeline: list) -> list:
    """
    Move compound.equals filters on token/enum fields out of $search into a post-$search
    $match. String-typed Atlas Search fields reject equals filters silently (0 results).
    """
    if not pipeline or not isinstance(pipeline[0], dict) or "$search" not in pipeline[0]:
        return pipeline

    search = dict(pipeline[0]["$search"])
    compound = search.get("compound")
    if not compound:
        return pipeline

    compound = dict(compound)
    post_match: dict = {}
    kept_filters = []
    for clause in compound.get("filter") or []:
        equals = clause.get("equals") if isinstance(clause, dict) else None
        if equals and equals.get("path") in _SEARCH_FILTER_FIELDS:
            post_match[equals["path"]] = equals["value"]
        else:
            kept_filters.append(clause)

    if kept_filters:
        compound["filter"] = kept_filters
    elif "filter" in compound:
        del compound["filter"]

    # Unwrap compound if it only had filters we moved out
    if not compound.get("must") and not compound.get("should") and not compound.get("minimumShouldMatch"):
        if compound.get("filter"):
            search["compound"] = compound
        else:
            search.pop("compound", None)
    else:
        search["compound"] = compound

    normalized = [{"$search": search}]
    if post_match:
        normalized.append({"$match": post_match})
    normalized.extend(pipeline[1:])
    return normalized


def _plan_blob(plan: dict) -> str:
    return json.dumps(plan.get("pipeline") or plan.get("filter") or {})


def _performance_hint(plan: dict) -> str:
    """Derive a human-readable performance note from the generated query plan."""
    blob = _plan_blob(plan)
    strategy = plan.get("query_strategy", "")
    hints: list[str] = []

    if "$search" in blob:
        match = re.search(r'"index"\s*:\s*"([^"]+)"', blob)
        idx = match.group(1) if match else "atlas search"
        hints.append(f"Atlas Search ({idx}) — index-backed text match; faster than $regex for keyword queries.")
    elif strategy == "atlas-search":
        hints.append("Atlas Search — index-backed text match; faster than $regex for keyword queries.")

    if "$regex" in blob:
        hints.append("Uses $regex — collection scan on matched field; prefer $eq/$in for known values or Atlas $search for free-text.")

    if "$expr" in blob:
        hints.append("Uses $expr — may prevent index usage; prefer direct field comparisons where possible.")

    if "$where" in blob:
        hints.append("Uses $where — blocks all indexes; rewrite with $match.")

    if "$text" in blob:
        hints.append("Uses legacy $text — no text index exists; use Atlas $search instead.")

    indexed_hits = [f for f in _INDEXED_FIELDS if f'"{f}"' in blob or f"'{f}'" in blob]
    if indexed_hits and ("$match" in blob or plan.get("filter")):
        fields = ", ".join(sorted(set(indexed_hits)))
        hints.append(f"Filters on indexed field(s): {fields}.")

    if plan.get("operation") == "find" and not plan.get("pipeline"):
        hints.append("Simple find query — preferred over aggregation for filter + sort + limit.")

    if "$unwind" in blob and "$match" in blob:
        # Heuristic: $match before $unwind is good
        try:
            pipeline = plan.get("pipeline") or []
            match_idx = next(i for i, s in enumerate(pipeline) if "$match" in s)
            unwind_idx = next(i for i, s in enumerate(pipeline) if "$unwind" in s)
            if match_idx < unwind_idx:
                hints.append("$match before $unwind — reduces documents before array expansion.")
            else:
                hints.append("$unwind before $match — consider moving $match earlier for better performance.")
        except StopIteration:
            pass

    if not hints:
        return "Compound index on {device_id, started_at} or {status, started_at} where applicable."

    return " ".join(hints)


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
                {"$match": {
                    "started_at": {"$gte": since_7d},
                    "$or": [
                        {"status": "fail", "failure_mode": {"$nin": [None, ""]}},
                        {
                            "status": "pass",
                            "failure_mode": "silent",
                            "results.components": {"$elemMatch": {"corruption_detected": True}},
                        },
                    ],
                }},
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

    # SYSTEM_PROMPT contains MongoDB {…} literals — inject via partial so LangChain
    # doesn't treat them as f-string template variables.
    prompt = ChatPromptTemplate.from_messages([
        ("system", "{system_prompt}"),
        ("human", "{question}"),
    ]).partial(system_prompt=SYSTEM_PROMPT)
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
            pipeline = _normalize_search_pipeline(plan["pipeline"])
            pipeline = _normalize_pipeline_projections(pipeline)
            cursor = coll.aggregate(pipeline)
            raw = await cursor.to_list(50)
            plan = {**plan, "pipeline": pipeline}
        else:
            filt = plan.get("filter") or {}
            proj = _normalize_projection(plan.get("projection"))
            sort_doc = plan.get("sort") or {"_id": -1}
            limit = min(plan.get("limit") or 20, 50)
            cursor = coll.find(filt, proj).sort(list(sort_doc.items())).limit(limit)
            raw = await cursor.to_list(limit)
            plan = {**plan, "projection": proj}

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
            "query_strategy": plan.get("query_strategy", ""),
            "performance_note": _performance_hint(plan),
        },
    }
