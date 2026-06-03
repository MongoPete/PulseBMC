# Cursor Context: Aaron Jin — AI-Assisted Hardware Fleet Monitoring POC
> Drop this file into your Cursor workspace. Reference it in chat as `@CURSOR_CONTEXT_AARON_POC.md`.
> Purpose: align Cursor with the POC vision, MongoDB schema decisions, and the analytical foundation before touching any code.

---

## 1. What We're Building

A proof-of-concept for **AI-assisted hardware fleet monitoring** — a system where operators can:

- Monitor BMC/edge-controller telemetry from many devices in real time
- Detect subtle, intermittent, and silent hardware failures (PCIe degradation, thermal anomalies, loopback failures, NaN-class silent data corruption)
- Use MongoDB Vector Search to find **similar past failures** from a historical incident corpus
- Get **AI-generated root-cause hypotheses and work orders** from an LLM layer
- Isolate a device, rerun diagnostics, and inspect hardware context — all from one operator UI

**This is not a dashboard. It is a diagnostic reasoning system with a UI.**

---

## 2. Why This Exists — The ByteDance Paper Connection

The analytical foundation for this POC comes from the ByteDance paper **"Robust LLM Training Infrastructure"** (SOSP '25), which studied 778,135 training jobs over 3 months on GPU clusters.

### Table 3 — The Core Business Case

This table is the single most important reference for why proactive telemetry collection matters:

| Failure Type | Detection WITH proactive monitoring | Detection WITHOUT |
|---|---|---|
| NIC crash | 30 seconds | ~10 min timeout |
| GPU Driver Hang | 10 seconds | ~10 min timeout |
| OS Kernel Fault | 2 seconds | ~10 min timeout |

**The takeaway:** Without real-time sensor monitoring, the system waits for a process timeout (NCCL, PyTorch Distributed) to know something is wrong — burning 10+ minutes of GPU cycles per incident. At fleet scale, that gap is the difference between a minor blip and a cascading outage.

Aaron's POC makes this argument for **server/data-center hardware**, not LLMs. The same principle holds: if you're waiting for a hard crash to detect a PCIe link degrading from x16 to x1, you've already lost significant operational time.

### Table 1 + Figure 3 — What Failures Actually Look Like

Table 1 breaks down ~55K incidents into three categories:
- **Explicit failures** (clear error signals) — 71% of incidents, 2–15 min to localize
- **Implicit failures** (job hangs, MFU decline, silent data corruption) — 10%+ of incidents, can take **1.5+ hours** to diagnose manually
- **Human/manual restarts** — 17.3%, meaning human-introduced changes are as significant a failure source as hardware

Figure 3 shows the unproductive time breakdown per incident: Detection → Localization → Failover. The key insight is that **implicit failures consume disproportionate diagnostic time** because there is no error signal — just a hung process or degraded throughput.

**Aaron's POC addresses this directly**: the `failure_events` collection + AI hypothesis layer is the equivalent of ByteRobust's automated stop-time diagnostics, compressing what took ByteDance engineers hours into an LLM-generated hypothesis in seconds.

### What Is NOT Relevant from the Paper

Figure 1 (LLM pretraining pipeline stages) is background context for ByteDance's system — it is not a template for Aaron's use case and should be ignored when building the POC.

---

## 3. MongoDB Schema — Four Collections

### Design Principle
**Two categories of data require different collection types:**
- High-frequency sensor readings → MongoDB native **Time-Series collection** (automatic bucketing, columnar compression, 70–90% storage reduction)
- Operational records (devices, failures, test runs) → Standard document collections

---

### Collection 1: `devices` — Device Registry

```javascript
{
  _id: ObjectId(),
  device_id: "bmc-rack12-node04",        // natural key, used for joins
  location: {
    datacenter: "SJC-01",
    rack: "rack-12",
    slot: 4
  },
  hardware: {
    model: "Supermicro X13SAE",
    bmc_firmware: "3.2.1",
    cpu_count: 2,
    pcie_slots: [
      { slot: 1, component: "NIC-25G", vendor: "Mellanox" },
      { slot: 2, component: "GPU-A100", vendor: "NVIDIA" }
    ]
  },
  status: "active",          // state machine: active → degraded → isolated → offline
  last_seen: ISODate("..."),
  tags: ["gpu-node", "high-memory"]
}
```

**Indexes:**
```javascript
{ "device_id": 1 }                              // unique
{ "location.datacenter": 1, "status": 1 }       // fleet dashboard: filter by DC + status
{ "tags": 1 }                                   // filter by device class
```

**Pattern note:** `status` is a **State Machine pattern** (MongoDB Applied Design Patterns). Atlas Triggers or Change Streams should drive UI updates on status transitions.

---

### Collection 2: `telemetry` — Time-Series Sensor Readings

**Create as a native time-series collection:**
```javascript
db.createCollection("telemetry", {
  timeseries: {
    timeField: "ts",
    metaField: "meta",
    granularity: "seconds"
  }
})
```

**Document shape:**
```javascript
{
  ts: ISODate("2025-10-20T14:22:05Z"),
  meta: {
    device_id: "bmc-rack12-node04",
    sensor_type: "thermal"    // thermal | pcie | power | memory | network
  },
  readings: {
    cpu0_temp_c: 72.4,
    cpu1_temp_c: 69.1,
    inlet_temp_c: 28.3,
    fan_rpm: [4200, 4150, 4300, 4280]
  }
}
```

**Important:** Keep `sensor_type` values as separate documents per tick — do NOT merge all sensor types into one fat document. Keeps time-series buckets coherent and prevents document growth.

**Secondary index:**
```javascript
{ "meta.device_id": 1, "ts": -1 }   // latest readings per device
```

**Scale note:** At 1 reading/sec across 1,000 devices = 86M raw documents/day. Time-series bucketing reduces this to ~10–15M bucket documents automatically. This is why you do NOT use a standard collection for telemetry.

**Sensor types must cover all failure categories from Table 3:**
- `thermal` — temperature, fan RPM
- `pcie` — link width, error counts, slot health
- `power` — voltage rails, power draw
- `memory` — ECC errors, row remapping events
- `network` — NIC status, packet loss rate, port flapping  ← **do not omit this**

---

### Collection 3: `failure_events` — The Core AI Collection

This is the most important collection. It stores structured failure records, AI-generated hypotheses, and vector embeddings for similarity search.

```javascript
{
  _id: ObjectId(),
  device_id: "bmc-rack12-node04",
  detected_at: ISODate("2025-10-20T14:22:00Z"),
  resolved_at: null,
  severity: "critical",          // info | warning | critical | silent

  failure_type: "pcie_link_down",         // categorical — used as pre-filter in vector search
  affected_component: "slot_2_GPU",

  // Flexible subdoc — schema intentionally varies by failure_type
  // PCIe failures, thermal events, SDC, and NIC failures have different evidence fields
  // This is WHY we use MongoDB over a relational schema here
  evidence: {
    loopback_result: "FAIL",
    pcie_link_width: "x1",                // degraded from x16
    error_count_24h: 47,
    last_healthy_ts: ISODate("2025-10-19T09:00:00Z"),
    nan_detected: false
  },

  // AI-generated — populated by LLM layer after vector search
  root_cause_hypothesis: "PCIe link degradation on GPU slot 2, likely physical connector or thermal expansion. Pattern matches 3 prior incidents on same hardware model.",
  confidence: 0.82,
  similar_incident_ids: [ObjectId("..."), ObjectId("...")],

  // Operator work order
  recommended_actions: [
    "Reseat GPU in slot 2",
    "Run extended loopback test post-reseat",
    "Check thermal history on slot 2 over last 7 days"
  ],
  work_order_status: "open",     // open | in_progress | resolved

  // Vector embedding of failure description + evidence summary
  // Populated at insert time using Voyage 4 (1024-dim)
  embedding: [0.021, -0.14, ...]
}
```

**Indexes:**
```javascript
{ "device_id": 1, "detected_at": -1 }          // per-device failure history
{ "failure_type": 1, "severity": 1 }            // fleet-wide failure type view
{ "work_order_status": 1, "detected_at": -1 }   // open work orders queue

// Atlas Vector Search index
{
  type: "vector",
  path: "embedding",
  numDimensions: 1024,
  similarity: "cosine"
}
```

---

### Collection 4: `test_runs` — Diagnostic Test Executions

Tracks operator-initiated or automated test runs. Separated from `failure_events` to keep the event log clean.

```javascript
{
  _id: ObjectId(),
  device_id: "bmc-rack12-node04",
  triggered_by: "operator",        // auto | operator
  triggered_at: ISODate("..."),
  completed_at: ISODate("..."),
  test_type: "loopback_pcie",
  parameters: { slot: 2, iterations: 100 },
  result: "FAIL",
  failure_detail: "32 errors in 100 iterations on slot 2",
  linked_failure_event_id: ObjectId("...")   // FK back to failure_events
}
```

**Indexes:**
```javascript
{ "device_id": 1, "triggered_at": -1 }
{ "linked_failure_event_id": 1 }
```

---

## 4. AI Layer — Vector Search Pipeline

When a new failure event arrives, embed its evidence summary and run similarity search against historical incidents:

```javascript
db.failure_events.aggregate([
  {
    $vectorSearch: {
      index: "failure_embedding_idx",
      path: "embedding",
      queryVector: <voyage4_embedding_of_new_event_summary>,
      numCandidates: 100,
      limit: 5,
      filter: { failure_type: "pcie_link_down" }   // pre-filter BEFORE vector search
    }
  },
  {
    $project: {
      device_id: 1,
      detected_at: 1,
      root_cause_hypothesis: 1,
      recommended_actions: 1,
      evidence: 1,
      score: { $meta: "vectorSearchScore" }
    }
  }
])
```

**Critical implementation note:** The `filter` on `failure_type` runs before the ANN search. This keeps the candidate set relevant before cosine similarity is applied — without it, a PCIe event might return thermally similar but causally irrelevant matches.

**Embedding model:** Voyage 4 (`voyage-4-large`, 1024-dim). Available via Atlas Embedding API. Embed at failure event creation time, not at query time.

---

## 5. Key MongoDB Positioning Points for This POC

These are the answers to "why MongoDB and not Postgres/Timescale/InfluxDB":

**Heterogeneous evidence schema:** PCIe failures, thermal anomalies, NIC events, and silent data corruption all have fundamentally different evidence fields. A relational schema forces nullable columns or an EAV table. The `evidence` subdoc in MongoDB handles this naturally — each failure type embeds exactly the fields it needs.

**Unified operational + vector store:** In a traditional stack, you'd need a time-series DB for telemetry, a relational DB for device/incident records, and a separate vector DB for embeddings. MongoDB handles all three — telemetry in time-series collections, structured records in standard collections, and vector search via Atlas. One platform, one query language, one operational surface.

**State machine on `devices.status`:** Atlas Triggers or Change Streams fire on status transitions. An operator isolating a device (`active → isolated`) automatically triggers downstream workflows — suspend telemetry ingestion, generate a work order, notify the on-call team — without polling or a separate event bus.

**Flexible schema absorbs hardware diversity:** A fleet of mixed hardware (different vendors, BMC firmware versions, component configurations) means telemetry schemas differ per device class. MongoDB's flexible document model handles this without schema migrations. New hardware classes are addable without touching existing data.

---

## 6. Instructions for Cursor

When analyzing the existing codebase against this vision, evaluate:

1. **Schema alignment** — Do the existing collection definitions match the four collections above? Are the right fields present, especially `embedding` in `failure_events` and `sensor_type` in `telemetry`?

2. **Time-series collection usage** — Is `telemetry` created as a native time-series collection with `timeField`, `metaField`, and `granularity`? A standard collection here is a correctness and scale issue.

3. **Index coverage** — Are the indexes defined? Specifically: the compound `{ "meta.device_id": 1, "ts": -1 }` on telemetry, and the vector index on `failure_events.embedding`.

4. **Network sensor type** — Is `network` present as a `sensor_type` in the telemetry layer? This is required to map to the NIC/network failure category from Table 3. Missing it means the POC cannot demonstrate detection of network-class hardware failures.

5. **Evidence subdoc flexibility** — Is `evidence` a flexible subdoc that varies by `failure_type`, or has it been flattened into a fixed schema? Flattening loses the MongoDB document model argument.

6. **AI pipeline wiring** — Is there a path from a new `failure_events` insert → embedding generation → vector search → LLM hypothesis → write back to the same document? This is the demo-able AI loop Aaron needs.

7. **Operator actions** — Can an operator isolate a device (status update), trigger a test run (insert to `test_runs`), and see the linked failure event? These three actions are the core of the operator UI story.

---

## 7. What a Successful POC Demonstrates

The demo should answer Aaron's question: *"Why MongoDB for this kind of system?"*

The answer is shown, not told, through:
- A fleet view where a device transitions from `active` to `degraded` as telemetry anomalies accumulate
- A failure event appearing automatically, with an AI-generated hypothesis that references a similar past incident
- An operator drilling into that incident, seeing the raw evidence, and issuing a work order in one action
- The work order linked back to a test run result that confirms or refutes the hypothesis

That loop — detect → explain → act — on a single platform, without external tooling — is the MongoDB story.
