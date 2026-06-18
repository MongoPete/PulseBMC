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


# ──────────────────────────────────────────────────────────────────────────────
# Pinned canonical plans + response cache
#
# The Explorer starter chips ask a fixed set of questions. Instead of paying an
# LLM round-trip (and inheriting occasional LLM mistakes) every time, we pin a
# hand-written, index-friendly plan per known question. The free-text box still
# uses the LLM; its results are cached briefly so repeated asks are instant.
# ──────────────────────────────────────────────────────────────────────────────

# Trailing time phrase the frontend may append ("… in the last 24 hours") or that
# the base question already contains ("… in the last 7 days", "… this week").
_TIME_SUFFIX_RE = re.compile(
    r"\s*(?:\b(?:in|from|over|during|within)\b\s+)?(?:the\s+)?(?:last|past)\s+"
    r"(?:\d+\s+)?(?:hour|hours|hr|hrs|day|days|week|weeks|month|months)\s*[?.!]*$",
    re.I,
)
_TIME_WORD_SUFFIX_RE = re.compile(
    r"\s*(?:this week|today|this month|last week)\s*[?.!]*$", re.I
)


def _canon(question: str) -> str:
    """Normalize a question for pinned-plan matching: lowercase, collapse spaces,
    and drop any trailing time-window phrase so scope variants map to one key."""
    s = " ".join((question or "").strip().lower().split())
    prev = None
    while prev != s:
        prev = s
        s = _TIME_SUFFIX_RE.sub("", s).strip()
        s = _TIME_WORD_SUFFIX_RE.sub("", s).strip()
    return s.rstrip("?.! ").strip()


def _cache_key(question: str) -> str:
    """Cache key keeps the time scope (different windows = different results)."""
    return " ".join((question or "").strip().lower().split()).rstrip("?.! ")


def _parse_since(question: str, now: datetime) -> str | None:
    """Derive an ISO started_at threshold from the question's time phrase, or None."""
    q = (question or "").lower()
    if "today" in q:
        midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return midnight.strftime("%Y-%m-%dT%H:%M:%S.%f")
    if "this week" in q or "last week" in q:
        return (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S.%f")
    m = re.search(r"\b(?:last|past)\s+(\d+)?\s*(hour|hours|hr|hrs|day|days|week|weeks)\b", q)
    if not m:
        return None
    n = int(m.group(1)) if m.group(1) else 1
    unit = m.group(2)
    if unit.startswith("h"):
        delta = timedelta(hours=n)
    elif unit.startswith("d"):
        delta = timedelta(days=n)
    else:
        delta = timedelta(weeks=n)
    return (now - delta).strftime("%Y-%m-%dT%H:%M:%S.%f")


def _runs_match(since_iso: str | None, **extra) -> dict:
    m = dict(extra)
    if since_iso:
        m["started_at"] = {"$gte": since_iso}
    return m


# Each builder: (since_iso, now) -> plan dict mirroring the LLM output contract.
def _pinned_lb_timeout(since, now):
    return {
        "collection": "test_runs", "operation": "find",
        "filter": _runs_match(since, **{
            "results.components": {"$elemMatch": {"component_id": "pcie_card_1", "error_code": "LB_TIMEOUT"}}
        }),
        "projection": {"device_id": 1, "started_at": 1, "status": 1, "led_state": 1, "failure_mode": 1, "true_fault_source": 1, "_id": 0},
        "sort": {"started_at": -1}, "limit": 20,
        "sql_equivalent": "SELECT device_id, started_at, status FROM test_runs r JOIN components c ON c.run_id=r.id\nWHERE c.component_id='pcie_card_1' AND c.error_code='LB_TIMEOUT' ORDER BY started_at DESC LIMIT 20",
        "answer_template": "Found RESULT loopback run(s) where pcie_card_1 reported LB_TIMEOUT.",
        "query_strategy": "indexed-equality",
    }


def _pinned_top_failing_device(since, now):
    return {
        "collection": "test_runs", "operation": "aggregate",
        "pipeline": [
            {"$match": _runs_match(since or (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S.%f"), status="fail", pattern_id="loopback_v1")},
            {"$group": {"_id": "$device_id", "failures": {"$sum": 1}}},
            {"$sort": {"failures": -1}}, {"$limit": 20},
            {"$project": {"device_id": "$_id", "failures": 1, "_id": 0}},
        ],
        "sql_equivalent": "SELECT device_id, COUNT(*) AS failures FROM test_runs\nWHERE status='fail' AND pattern_id='loopback_v1' AND started_at>=:since\nGROUP BY device_id ORDER BY failures DESC LIMIT 20",
        "answer_template": "Ranked RESULT device(s) by loopback_v1 failures.",
        "query_strategy": "aggregation",
    }


def _pinned_error_breakdown(since, now):
    s = since or (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S.%f")
    return {
        "collection": "test_runs", "operation": "aggregate",
        "pipeline": [
            {"$match": _runs_match(s, status="fail")},
            {"$unwind": "$results.components"},
            {"$match": {"results.components.error_code": {"$ne": None}}},
            {"$group": {"_id": "$results.components.error_code", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$project": {"error_code": "$_id", "count": 1, "_id": 0}},
        ],
        "sql_equivalent": "SELECT c.error_code, COUNT(*) AS count FROM test_runs r JOIN components c ON c.run_id=r.id\nWHERE r.status='fail' AND r.started_at>=:since AND c.error_code IS NOT NULL\nGROUP BY c.error_code ORDER BY count DESC",
        "answer_template": "Aggregated RESULT distinct loopback error code(s).",
        "query_strategy": "aggregation",
    }


def _pinned_signal_vs_continuity(since, now):
    s = since or (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S.%f")
    return {
        "collection": "test_runs", "operation": "aggregate",
        "pipeline": [
            {"$match": _runs_match(s, status="fail")},
            {"$unwind": "$results.components"},
            {"$match": {"results.components.error_code": {"$in": ["SIGNAL_INTEGRITY_ERR", "CONTINUITY_FAIL"]}}},
            {"$group": {"_id": "$results.components.error_code", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$project": {"error_code": "$_id", "count": 1, "_id": 0}},
        ],
        "sql_equivalent": "SELECT c.error_code, COUNT(*) FROM test_runs r JOIN components c ON c.run_id=r.id\nWHERE r.status='fail' AND r.started_at>=:since AND c.error_code IN ('SIGNAL_INTEGRITY_ERR','CONTINUITY_FAIL')\nGROUP BY c.error_code ORDER BY count DESC",
        "answer_template": "Compared RESULT error code group(s): SIGNAL_INTEGRITY_ERR vs CONTINUITY_FAIL.",
        "query_strategy": "aggregation",
    }


def _pinned_high_core_temp(since, now):
    return {
        "collection": "test_runs", "operation": "find",
        "filter": _runs_match(since, **{
            "results.components.core_results": {"$elemMatch": {"temp_c": {"$gt": 80}}}
        }),
        "projection": {"device_id": 1, "started_at": 1, "status": 1, "led_state": 1, "_id": 0},
        "sort": {"started_at": -1}, "limit": 20,
        "sql_equivalent": "SELECT device_id, started_at, status FROM test_runs r JOIN core_results k ON k.run_id=r.id\nWHERE k.temp_c > 80 ORDER BY started_at DESC LIMIT 20",
        "answer_template": "Found RESULT run(s) with a core temperature above 80C.",
        "query_strategy": "indexed-range",
    }


def _pinned_core_latency(since, now):
    return {
        "collection": "test_runs", "operation": "find",
        "filter": _runs_match(since, **{
            "results.components": {"$elemMatch": {"component_id": "pcie_card_1", "core_results": {"$elemMatch": {"latency_ms": {"$gt": 6}}}}}
        }),
        "projection": {"device_id": 1, "started_at": 1, "status": 1, "_id": 0},
        "sort": {"started_at": -1}, "limit": 20,
        "sql_equivalent": "SELECT device_id, started_at, status FROM test_runs r JOIN components c ON c.run_id=r.id JOIN core_results k ON k.component_id=c.id\nWHERE c.component_id='pcie_card_1' AND k.latency_ms > 6 ORDER BY started_at DESC LIMIT 20",
        "answer_template": "Found RESULT run(s) with pcie_card_1 core latency above 6ms.",
        "query_strategy": "indexed-equality",
    }


def _pinned_intermittent(since, now):
    s = since or (now - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%S.%f")
    return {
        "collection": "test_runs", "operation": "find",
        "filter": _runs_match(s, failure_mode="intermittent"),
        "projection": {"device_id": 1, "started_at": 1, "status": 1, "failure_mode": 1, "_id": 0},
        "sort": {"started_at": -1}, "limit": 20,
        "sql_equivalent": "SELECT device_id, started_at, status FROM test_runs\nWHERE failure_mode='intermittent' AND started_at>=:since ORDER BY started_at DESC LIMIT 20",
        "answer_template": "Found RESULT intermittent-mode loopback run(s).",
        "query_strategy": "indexed-equality",
    }


def _pinned_silent_corruption(since, now):
    return {
        "collection": "test_runs", "operation": "find",
        "filter": _runs_match(since, status="pass", **{
            "results.components": {"$elemMatch": {"corruption_detected": True}}
        }),
        "projection": {"device_id": 1, "started_at": 1, "status": 1, "failure_mode": 1, "_id": 0},
        "sort": {"started_at": -1}, "limit": 20,
        "sql_equivalent": "SELECT device_id, started_at, status FROM test_runs r JOIN components c ON c.run_id=r.id\nWHERE r.status='pass' AND c.corruption_detected=true ORDER BY started_at DESC LIMIT 20",
        "answer_template": "Found RESULT passing run(s) with silent CRC corruption detected.",
        "query_strategy": "indexed-equality",
    }


def _pinned_media_errors(since, now):
    return {
        "collection": "test_runs", "operation": "aggregate",
        "pipeline": [
            {"$match": {"nvme_smart.media_errors": {"$gt": 0}}},
            {"$group": {"_id": "$device_id", "max_media_errors": {"$max": "$nvme_smart.media_errors"}}},
            {"$sort": {"max_media_errors": -1}}, {"$limit": 20},
            {"$project": {"device_id": "$_id", "max_media_errors": 1, "_id": 0}},
        ],
        "sql_equivalent": "SELECT device_id, MAX(nvme_smart_media_errors) AS max_media_errors FROM test_runs\nWHERE nvme_smart_media_errors > 0 GROUP BY device_id ORDER BY max_media_errors DESC LIMIT 20",
        "answer_template": "Ranked RESULT device(s) by peak NVMe media_errors.",
        "query_strategy": "aggregation",
    }


def _pinned_failures_by_datacenter(since, now):
    s = since or (now - timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S.%f")
    return {
        "collection": "test_runs", "operation": "aggregate",
        "pipeline": [
            {"$match": _runs_match(s, status="fail")},
            {"$lookup": {"from": "devices", "localField": "device_id", "foreignField": "device_id", "as": "dev"}},
            {"$unwind": "$dev"},
            {"$group": {"_id": "$dev.location.datacenter", "failures": {"$sum": 1}}},
            {"$sort": {"failures": -1}},
            {"$project": {"datacenter": "$_id", "failures": 1, "_id": 0}},
        ],
        "sql_equivalent": "SELECT d.datacenter, COUNT(*) AS failures FROM test_runs r LEFT JOIN devices d ON d.device_id=r.device_id\nWHERE r.status='fail' AND r.started_at>=:since GROUP BY d.datacenter ORDER BY failures DESC",
        "answer_template": "Aggregated loopback failures across RESULT datacenter(s).",
        "query_strategy": "aggregation",
    }


def _pinned_open_high_sev_alerts(since, now):
    return {
        "collection": "alerts", "operation": "find",
        "filter": {"status": "open", "failure_rate": {"$gt": 0.10}},
        "projection": {"device_id": 1, "summary": 1, "severity": 1, "failure_rate": 1, "status": 1, "triggered_at": 1, "_id": 0},
        "sort": {"triggered_at": -1}, "limit": 20,
        "sql_equivalent": "SELECT device_id, summary, severity, failure_rate FROM alerts\nWHERE status='open' AND failure_rate > 0.10 ORDER BY triggered_at DESC LIMIT 20",
        "answer_template": "Found RESULT open alert(s) with failure rate above 10%.",
        "query_strategy": "indexed-equality",
    }


def _pinned_alert_keyword(since, now):
    return {
        "collection": "alerts", "operation": "aggregate",
        "pipeline": [
            {"$search": {"index": "alerts_lexical_idx", "text": {"query": "loopback failure threshold", "path": "summary"}}},
            {"$match": {"status": "open"}},
            {"$limit": 20},
            {"$project": {"device_id": 1, "summary": 1, "severity": 1, "status": 1, "triggered_at": 1, "_id": 0}},
        ],
        "sql_equivalent": "-- Full-text search (Atlas Search), not LIKE/regex\nSELECT device_id, summary, severity FROM alerts\nWHERE to_tsvector(summary) @@ to_tsquery('loopback & failure & threshold') AND status='open' LIMIT 20",
        "answer_template": "Found RESULT open alert(s) matching the keyword search.",
        "query_strategy": "atlas-search",
    }


def _pinned_upstream_fault(since, now):
    return {
        "collection": "test_runs", "operation": "aggregate",
        "pipeline": [
            {"$match": {"status": "fail", "true_fault_source": {"$ne": None}}},
            {"$group": {"_id": "$true_fault_source", "failures": {"$sum": 1}}},
            {"$sort": {"failures": -1}},
            {"$project": {"true_fault_source": "$_id", "failures": 1, "_id": 0}},
        ],
        "sql_equivalent": "SELECT true_fault_source, COUNT(*) AS failures FROM test_runs\nWHERE status='fail' AND true_fault_source IS NOT NULL GROUP BY true_fault_source ORDER BY failures DESC",
        "answer_template": "Attributed failures to RESULT upstream PCIe controller(s).",
        "query_strategy": "aggregation",
    }


def _pinned_devices_not_online(since, now):
    return {
        "collection": "devices", "operation": "find",
        "filter": {"status": {"$in": ["offline", "maintenance", "degrading"]}},
        "projection": {"device_id": 1, "hostname": 1, "status": 1, "location": 1, "_id": 0},
        "sort": {"status": 1}, "limit": 50,
        "sql_equivalent": "SELECT device_id, hostname, status FROM devices\nWHERE status IN ('offline','maintenance','degrading') ORDER BY status",
        "answer_template": "Found RESULT device(s) that are offline, in maintenance, or degrading.",
        "query_strategy": "indexed-equality",
    }


def _pinned_devices_degrading(since, now):
    return {
        "collection": "devices", "operation": "find",
        "filter": {"status": "degrading"},
        "projection": {"device_id": 1, "hostname": 1, "status": 1, "location": 1, "_id": 0},
        "sort": {"device_id": 1}, "limit": 50,
        "sql_equivalent": "SELECT device_id, hostname, status FROM devices WHERE status='degrading' ORDER BY device_id",
        "answer_template": "Found RESULT degrading device(s).",
        "query_strategy": "indexed-equality",
    }


def _pinned_open_alerts_by_severity(since, now):
    return {
        "collection": "alerts", "operation": "find",
        "filter": {"status": "open"},
        "projection": {"device_id": 1, "summary": 1, "severity": 1, "failure_rate": 1, "triggered_at": 1, "_id": 0},
        "sort": {"severity": -1, "triggered_at": -1}, "limit": 50,
        "sql_equivalent": "SELECT device_id, summary, severity FROM alerts WHERE status='open' ORDER BY severity DESC, triggered_at DESC",
        "answer_template": "Found RESULT open alert(s), ordered by severity.",
        "query_strategy": "indexed-equality",
    }


# Map canonical question text -> builder. Keys are run through _canon at startup.
_PINNED_RAW = {
    "Show loopback test runs where pcie_card_1 failed with LB_TIMEOUT": _pinned_lb_timeout,
    "Which device has the most loopback_v1 failures in the last 7 days?": _pinned_top_failing_device,
    "What loopback error codes appeared most often this week?": _pinned_error_breakdown,
    "How many SIGNAL_INTEGRITY_ERR vs CONTINUITY_FAIL errors occurred in the last 7 days?": _pinned_signal_vs_continuity,
    "Show loopback runs where any core temperature exceeded 80°C": _pinned_high_core_temp,
    "Find loopback runs where core latency exceeded 6ms on pcie_card_1": _pinned_core_latency,
    "List intermittent failure mode loopback test runs from the last 7 days": _pinned_intermittent,
    "Show passing loopback tests where silent CRC corruption was detected": _pinned_silent_corruption,
    "Which devices have the highest NVMe media_errors count?": _pinned_media_errors,
    "Which datacenter has the most loopback failures in the last 24 hours?": _pinned_failures_by_datacenter,
    "Show open alerts with failure rate above 10%": _pinned_open_high_sev_alerts,
    "Find open alerts mentioning loopback failure threshold": _pinned_alert_keyword,
    "Which upstream PCIe controller is linked to the most loopback failures?": _pinned_upstream_fault,
    "Which devices are offline, in maintenance, or degrading?": _pinned_devices_not_online,
    # Facet-bar chips (fixed strings)
    "Which devices are currently degrading?": _pinned_devices_degrading,
    "Show all open alerts ordered by severity": _pinned_open_alerts_by_severity,
}
_PINNED = {_canon(k): v for k, v in _PINNED_RAW.items()}


def _match_pinned(question: str, now: datetime) -> dict | None:
    builder = _PINNED.get(_canon(question))
    if not builder:
        return None
    return builder(_parse_since(question, now), now)


_CACHE_TTL = 60.0
_CACHE_MAX = 256
_query_cache: dict[str, tuple[float, dict]] = {}


def _cache_get(key: str) -> dict | None:
    hit = _query_cache.get(key)
    if not hit:
        return None
    ts, payload = hit
    if time.time() - ts > _CACHE_TTL:
        _query_cache.pop(key, None)
        return None
    return payload


def _cache_put(key: str, payload: dict) -> None:
    if len(_query_cache) >= _CACHE_MAX:
        # Drop the oldest entry (simple FIFO eviction)
        oldest = min(_query_cache.items(), key=lambda kv: kv[1][0])[0]
        _query_cache.pop(oldest, None)
    _query_cache[key] = (time.time(), payload)


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
    now = datetime.utcnow()

    # 1. Cache — repeated questions (same time scope) skip both LLM and Atlas.
    ckey = _cache_key(req.question)
    cached = _cache_get(ckey)
    if cached is not None:
        return {**cached, "cached": True, "duration_ms": int((time.time() - start) * 1000)}

    # 2. Pinned plan — known starter/facet questions skip the LLM entirely.
    plan = _match_pinned(req.question, now)
    optimization = "pinned"

    if plan is None:
        optimization = "llm"
        # Translate natural language → MongoDB query via LLM.
        # Inject current UTC time so the LLM can compute ISO date thresholds directly
        # instead of using $expr/$dateSubtract at runtime.
        now_iso = now.strftime("%Y-%m-%dT%H:%M:%S.000000")
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

    response = {
        "question": req.question,
        "natural_language_summary": summary,
        "data": data,
        "total": len(data),
        "duration_ms": duration_ms,
        "cached": False,
        "query_info": {
            "collection": collection,
            "operation": operation,
            "mongodb_pipeline": plan.get("pipeline"),
            "mongodb_filter": plan.get("filter"),
            "sql_equivalent": plan.get("sql_equivalent", ""),
            "query_strategy": plan.get("query_strategy", ""),
            "performance_note": _performance_hint(plan),
            "optimization": optimization,
        },
    }

    # Cache successful results (pinned + LLM) for the short TTL.
    _cache_put(ckey, response)
    return response
