"use client";
import { useState, type ReactNode } from "react";
import ConceptBar from "@/components/ConceptBar";
import PageShell, { PageMain } from "@/components/PageShell";

// ── Reusable primitives ──────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}

function SqlBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] bg-blue-50 border border-blue-300 text-blue-700 px-1.5 py-0.5 rounded font-mono">
      SQL: {label}
    </span>
  );
}

function MgBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] bg-emerald-50 border border-emerald-300 text-emerald-700 px-1.5 py-0.5 rounded font-mono">
      MDB: {label}
    </span>
  );
}

// ── Syntax highlighting (light theme) ────────────────────────────────────────

function tokenize(
  code: string,
  re: RegExp,
  pick: (m: RegExpExecArray, k: number) => ReactNode,
): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0, k = 0;
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index > last) parts.push(code.slice(last, m.index));
    parts.push(pick(m, k++));
    last = re.lastIndex;
  }
  if (last < code.length) parts.push(code.slice(last));
  return <>{parts}</>;
}

// Groups: 1=comment  2=mongoFn  3=mongoArg  4=keyStr  5=keyColon  6=valStr  7=bool  8=num  9=$op
const JSON_RE = /(\/\/[^\n]*)|(ObjectId|ISODate)\(("[^"]*")\)|("(?:[^"\\]|\\.)*")([ \t]*:)|("(?:[^"\\]|\\.)*")|(\btrue\b|\bfalse\b|\bnull\b)|([-]?\d+(?:\.\d+)?)(?=[\s,\]\}]|$)|(\$\w+)/gm;

function JsonDoc({ code }: { code: string }) {
  return <>{tokenize(code, JSON_RE, ([full, comment, fn, fnArg, keyStr, keyColon, valStr, bool, num, op], k) => {
    if (comment) return <span key={k} className="text-slate-400 italic">{comment}</span>;
    if (fn)      return <span key={k}><span className="text-violet-600 font-semibold">{fn}</span><span className="text-slate-400">(</span><span className="text-emerald-700">{fnArg}</span><span className="text-slate-400">)</span></span>;
    if (keyStr)  return <span key={k}><span className="text-slate-800 font-bold">{keyStr}</span><span className="text-slate-400">{keyColon}</span></span>;
    if (valStr)  return <span key={k} className="text-emerald-700">{valStr}</span>;
    if (bool)    return <span key={k} className="text-rose-600 font-semibold">{bool}</span>;
    if (num)     return <span key={k} className="text-orange-600">{num}</span>;
    if (op)      return <span key={k} className="text-emerald-600 font-semibold">{op}</span>;
    return <span key={k}>{full}</span>;
  })}</>;
}

// Groups: 1=comment  2=string  3=num  4=keyword  5=type
const SQL_RE = /(--[^\n]*)|('[^']*')|([-]?\d+(?:\.\d+)?)|(\b(?:SELECT|FROM|WHERE|JOIN|ON|ORDER|BY|LIMIT|GROUP|CREATE|TABLE|INSERT|INTO|REFERENCES|PRIMARY|KEY|NOT|NULL|AND|OR|AS|LEFT|INNER|ALTER|ADD|COLUMN|DISTINCT|HAVING|SERIAL)\b)|(\b(?:VARCHAR|INTEGER|TIMESTAMP|BOOLEAN|TEXT|BIGINT|FLOAT)\b)/gim;

function SqlDoc({ code }: { code: string }) {
  return <>{tokenize(code, SQL_RE, ([full, comment, str, num, kw, type], k) => {
    if (comment) return <span key={k} className="text-slate-400 italic">{comment}</span>;
    if (str)     return <span key={k} className="text-emerald-700">{str}</span>;
    if (num)     return <span key={k} className="text-orange-600">{num}</span>;
    if (kw)      return <span key={k} className="text-blue-700 font-semibold">{kw}</span>;
    if (type)    return <span key={k} className="text-cyan-700">{type}</span>;
    return <span key={k}>{full}</span>;
  })}</>;
}

// Groups: 1=comment  2=string  3=placeholder  4=$op  5=keyword  6=num
const GEN_RE = /(\/\/[^\n]*|#[^\n]*|--[^\n]*)|("[^"]*"|'[^']*')|(<[^>\n]+>)|(\$\w+)|(\b(?:async|for|in|await|def|return|if|elif|else|import|from)\b)|([-]?\d+(?:\.\d+)?)/gm;

function GenericCode({ code }: { code: string }) {
  return <>{tokenize(code, GEN_RE, ([full, comment, str, placeholder, op, kw, num], k) => {
    if (comment)     return <span key={k} className="text-slate-400 italic">{comment}</span>;
    if (str)         return <span key={k} className="text-emerald-700">{str}</span>;
    if (placeholder) return <span key={k} className="text-violet-600">{placeholder}</span>;
    if (op)          return <span key={k} className="text-emerald-600 font-semibold">{op}</span>;
    if (kw)          return <span key={k} className="text-blue-700 font-semibold">{kw}</span>;
    if (num)         return <span key={k} className="text-orange-600">{num}</span>;
    return <span key={k}>{full}</span>;
  })}</>;
}

// ── 1. System flow diagram ───────────────────────────────────────────────────

function FlowArrow() {
  return <div className="flex items-center text-slate-400 text-xl px-1 select-none font-bold">→</div>;
}

function FlowBox({
  label, sub, color = "slate",
}: {
  label: string; sub: string; color?: "green" | "blue" | "amber" | "teal" | "slate";
}) {
  const colors = {
    green:  "border-emerald-300 bg-emerald-50 text-emerald-800",
    blue:   "border-blue-300 bg-blue-50 text-blue-800",
    amber:  "border-amber-300 bg-amber-50 text-amber-800",
    teal:   "border-[#009999] bg-[#f0fafa] text-[#005159]",
    slate:  "border-slate-300 bg-white text-slate-700",
  };
  return (
    <div className={`border-2 rounded-xl px-4 py-3 text-center min-w-[130px] ${colors[color]}`}>
      <div className="text-sm font-bold">{label}</div>
      <div className="text-[11px] mt-0.5 opacity-80">{sub}</div>
    </div>
  );
}

function OverviewTier({
  tier, title, desc, color,
}: {
  tier: string; title: string; desc: string; color: "amber" | "slate" | "blue";
}) {
  const colors = {
    amber: "border-amber-300 bg-amber-50 text-amber-800",
    slate: "border-slate-300 bg-white text-slate-700",
    blue:  "border-blue-300 bg-blue-50 text-blue-800",
  };
  return (
    <div className={`flex-1 min-w-[150px] border-2 rounded-xl px-4 py-3 ${colors[color]}`}>
      <div className="text-[10px] uppercase tracking-wide font-bold opacity-70">{tier}</div>
      <div className="text-sm font-bold mt-0.5">{title}</div>
      <div className="text-[11px] mt-1 opacity-80 leading-snug">{desc}</div>
    </div>
  );
}

function SimplifiedArchitecture() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-4 font-bold">At a glance — four layers, one platform</p>
      <div className="flex items-stretch gap-1 flex-wrap">
        <OverviewTier tier="Edge" title="Hardware" desc="BMC devices execute deterministic test patterns and report pass/fail per component" color="amber" />
        <FlowArrow />
        <OverviewTier tier="Service" title="Application" desc="FastAPI — ingest, SSE, diagnostic chain" color="slate" />
        <FlowArrow />

        {/* Atlas hub — emphasized as the single platform */}
        <div className="flex-1 min-w-[210px] border-2 border-emerald-300 bg-emerald-50 rounded-xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-wide font-bold text-emerald-700/70">Data platform</div>
          <div className="text-sm font-bold text-emerald-800 mt-0.5">MongoDB Atlas</div>
          <div className="text-[11px] text-emerald-700/80 mt-1">one cluster, three jobs</div>
          <div className="flex flex-wrap gap-1 mt-2">
            {["Document store", "Change Streams", "Vector Search"].map((chip) => (
              <span key={chip} className="text-[10px] font-mono bg-white border border-emerald-300 text-emerald-700 rounded px-1.5 py-0.5">
                {chip}
              </span>
            ))}
          </div>
        </div>

        <FlowArrow />
        <OverviewTier tier="Client" title="Operator UI" desc="Next.js dashboard — fleet, alerts, explorer" color="blue" />
      </div>
        <p className="text-xs text-slate-500 border-t border-slate-200 pt-3 mt-4 leading-relaxed">
        One MongoDB Atlas cluster handles storage, real-time change streams, and vector search — so there&apos;s no separate cache, message bus, or vector database to operate. Pattern result telemetry from each BMC streams directly into Atlas with no intermediate store.
      </p>
    </div>
  );
}

function ArchFlowDiagram() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6 shadow-sm">
      {/* Main horizontal flow */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-4 font-bold">Write path — loopback data to Atlas</p>
        <div className="flex items-center gap-1 flex-wrap">
          <FlowBox label="BMC Device" sub="hardware under test" color="amber" />
          <FlowArrow />
          <FlowBox label="emit_tests.py" sub="simulator / fleet host" color="amber" />
          <FlowArrow />
          <FlowBox label="POST /api/test-runs" sub="FastAPI · port 8000" color="slate" />
          <FlowArrow />
          <FlowBox label="MongoDB Atlas" sub="pulse_bmc database" color="green" />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Read + real-time path */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-4 font-bold">Read path — real-time to browser</p>
        <div className="flex items-center gap-1 flex-wrap">
          <FlowBox label="MongoDB Atlas" sub="Change Stream on insert" color="green" />
          <FlowArrow />
          <FlowBox label="SSE stream" sub="GET /api/test-runs/stream" color="slate" />
          <FlowArrow />
          <FlowBox label="Next.js UI" sub="EventSource · port 3000" color="blue" />
          <FlowArrow />
          <FlowBox label="LED updates" sub="green / red / pulse" color="blue" />
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-slate-200" />

      {/* Diagnostic path */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-4 font-bold">Diagnostic path — alert → fault isolation → work order</p>
        <div className="flex items-center gap-1 flex-wrap">
          <FlowBox label="Alert fires" sub="failure_rate > 10%" color="amber" />
          <FlowArrow />
          <FlowBox label="$vectorSearch" sub="Atlas finds similar failures" color="green" />
          <FlowArrow />
          <FlowBox label="Fault Isolation" sub="root cause + work order" color="teal" />
          <FlowArrow />
          <FlowBox label="agent_runs" sub="logged to Atlas" color="green" />
        </div>
        <p className="text-xs text-slate-500 border-t border-slate-200 pt-3 mt-4 leading-relaxed">
          The test pattern results stored here originate from Siemens EDA ATPG — PulseBMC closes the loop by monitoring pattern execution health at fleet scale.
        </p>
      </div>

      {/* SQL annotation */}
      <p className="text-xs text-slate-500 border-t border-slate-200 pt-3 leading-relaxed">
        SQL equivalent: the Change Stream is like a stored procedure <span className="font-mono text-blue-700">TRIGGER AFTER INSERT</span> + <span className="font-mono text-blue-700">LISTEN/NOTIFY</span> across a network socket. The aggregation alert check replaces a scheduled <span className="font-mono text-blue-700">GROUP BY</span> job.
      </p>
    </div>
  );
}

// ── 1c. AI Agent Chain ───────────────────────────────────────────────────────

const CHAIN_STAGES = [
  {
    num: "1",
    label: "Failure Prediction",
    file: "backend/app/agents/failure_prediction.py",
    color: "amber" as const,
    mongoOps: [
      { op: "$match → $unwind → $group", sql: "WHERE + JOIN + GROUP BY", desc: "Motor aggregation over test_runs computes per-component failure rate over the last 24 h window" },
    ],
    detail: "Scans test_runs for the target device. Unwinds the embedded components[] array (no JOIN needed) and groups by component_id to compute failure rates. Components above 10% trigger RAG retrieval.",
  },
  {
    num: "2",
    label: "Root Cause Analysis",
    file: "backend/app/agents/root_cause.py",
    color: "indigo" as const,
    mongoOps: [
      { op: "$vectorSearch", sql: "No SQL equivalent", desc: "find_similar_failures tool vectorizes the alert description, then runs $vectorSearch on test_runs_vector_idx (1024-dim) to retrieve semantically similar past failures" },
      { op: "agent_runs.find()", sql: "SELECT … ORDER BY confidence DESC", desc: "Pulls top past RCA conclusions from agent_runs to inject as knowledge-base context into the prompt" },
    ],
    detail: "Automated root cause analysis pipeline. The input is augmented with: (a) Atlas Vector Search results — semantically similar past failures; (b) live hardware telemetry context from the latest test_run document; (c) top past RCA conclusions from the agent_runs knowledge base.",
  },
  {
    num: "3",
    label: "Work Order Generation",
    file: "backend/app/agents/work_order.py",
    color: "green" as const,
    mongoOps: [
      { op: "agent_runs.insert_one()", sql: "INSERT INTO agent_runs", desc: "Full trace — input, retrieved docs, tool calls, prediction + RCA + work order — written to agent_runs for audit and future KB queries" },
    ],
    detail: "A structured work order (priority, repair steps, required parts, safety notes) is generated from the root cause output and retrieved incident summaries. The complete run is persisted to agent_runs, which acts as the growing knowledge base for future analyses.",
  },
];

const STAGE_STYLES = {
  amber:  { border: "border-amber-300",  header: "bg-amber-50",   title: "text-amber-800",   num: "#B45309" },
  indigo: { border: "border-slate-400",  header: "bg-[#000028]",  title: "text-white",       num: "#009999" },
  green:  { border: "border-emerald-300",header: "bg-emerald-50", title: "text-emerald-800", num: "#047857" },
};

function ChainStageCard({ stage }: { stage: typeof CHAIN_STAGES[0] }) {
  const s = STAGE_STYLES[stage.color];
  return (
    <div className={`border-2 ${s.border} rounded-xl overflow-hidden bg-white shadow-sm`}>
      <div className={`${s.header} px-5 py-3 border-b ${s.border} flex items-start gap-3`}>
        <span
          className="w-7 h-7 shrink-0 rounded-full text-white text-sm font-bold flex items-center justify-center mt-0.5"
          style={{ background: s.num }}
        >
          {stage.num}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${s.title}`}>{stage.label}</p>
          <p className="text-[11px] font-mono text-slate-400 mt-0.5">{stage.file}</p>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        <p className="text-sm text-slate-700 leading-relaxed">{stage.detail}</p>
        <div className="space-y-2">
          {stage.mongoOps.map((op) => (
            <div key={op.op} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <MgBadge label={op.op} />
                <span className="text-slate-300 text-xs">→</span>
                <SqlBadge label={op.sql} />
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">{op.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentChainSection() {
  return (
    <section className="space-y-5">
      <SectionHeader
        title="Diagnostic Chain — How It Uses MongoDB"
        subtitle="Three stages, each reading from or writing to Atlas — no external vector database, no separate knowledge store"
      />

      {/* Chain overview flow */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <p className="text-xs text-slate-500 uppercase tracking-wide font-bold mb-4">Diagnostic chain flow — triggered by an open alert</p>
        <div className="flex items-center gap-1 flex-wrap">
          <FlowBox label="Open Alert" sub="alerts collection" color="amber" />
          <FlowArrow />
          <FlowBox label="Stage 1" sub="Failure Prediction" color="amber" />
          <FlowArrow />
          <FlowBox label="Stage 2" sub="Root Cause + RAG" color="teal" />
          <FlowArrow />
          <FlowBox label="Stage 3" sub="Work Order" color="teal" />
          <FlowArrow />
          <FlowBox label="agent_runs" sub="logged to Atlas" color="green" />
        </div>
        <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
          {[
            { label: "Similarity corpus", value: "test_runs collection — 1024-dim embeddings stored as a field on each document, queried via $vectorSearch" },
            { label: "Knowledge base", value: "agent_runs collection — past RCA conclusions are queried to inform new analyses" },
            { label: "Similarity search", value: "$vectorSearch on test_runs_vector_idx — semantic match, not keyword match" },
          ].map((item) => (
            <div key={item.label} className="bg-slate-50 rounded-lg border border-slate-200 px-3 py-2">
              <p className="font-semibold text-slate-600 mb-0.5">{item.label}</p>
              <p className="text-slate-500 leading-relaxed">{item.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Stage cards */}
      <div className="space-y-3">
        {CHAIN_STAGES.map((stage) => <ChainStageCard key={stage.num} stage={stage} />)}
      </div>

      {/* Vector Search embedding callout */}
      <div className="bg-white border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "#009999" }}>Atlas Vector Search — how embeddings work</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-700">
          <div>
            <p className="font-semibold text-slate-800 mb-1">Ingestion time</p>
            <p className="leading-relaxed text-slate-600">
              After a failed test_run is written to Atlas, a background task generates a 1,024-dim vector
              representation of the failure. The vector is stored directly on the document as an{" "}
              <span className="font-mono" style={{ color: "#009999" }}>embedding</span> field — no separate vector store.
            </p>
            <p className="text-[11px] font-mono text-slate-400 mt-1.5">backend/app/services/embeddings.py</p>
          </div>
          <div>
            <p className="font-semibold text-slate-800 mb-1">Query time (similarity retrieval)</p>
            <p className="leading-relaxed text-slate-600">
              When Stage 2 runs, the alert description is vectorized and passed to{" "}
              <span className="font-mono" style={{ color: "#009999" }}>$vectorSearch</span>. Atlas returns the top-7
              semantically similar past failures — no external vector database, no data movement.
            </p>
            <p className="text-[11px] font-mono text-slate-400 mt-1.5">backend/app/tools/find_similar_failures.py</p>
          </div>
        </div>
      </div>

      {/* agent_runs KB callout */}
      <div className="bg-white border border-emerald-200 rounded-xl px-5 py-4 shadow-sm">
        <p className="text-xs font-bold text-emerald-700 uppercase tracking-wide mb-2">agent_runs — the growing knowledge base</p>
        <p className="text-sm text-slate-700 leading-relaxed mb-3">
          Every diagnostic chain run is persisted as a document in <span className="font-mono text-emerald-700">agent_runs</span>.
          Future runs query this collection to surface the top high-confidence past root cause conclusions as context.
          The Knowledge Base panel on the Alerts page surfaces patterns from this collection via <span className="font-mono text-emerald-700">$aggregate</span> pipelines.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
          {[
            { sql: "$group by root_cause_hypothesis", desc: "Recurring hypotheses — which failure class appears most across the fleet" },
            { sql: "$unwind at_risk_components + $group", desc: "Most flagged components — which PCIe cards fail most across devices" },
            { sql: "$group by work_order.priority", desc: "Priority distribution — P1/P2/P3/P4 breakdown of all generated work orders" },
          ].map((item) => (
            <div key={item.sql} className="bg-emerald-50 rounded-lg border border-emerald-200 px-3 py-2.5">
              <p className="font-mono text-emerald-700 font-semibold mb-1">{item.sql}</p>
              <p className="text-slate-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
        <p className="text-[11px] font-mono text-slate-400 mt-2">backend/app/routes/agents.py → /agents/knowledge-base</p>
      </div>
    </section>
  );
}

// ── 2. Document model vs SQL ─────────────────────────────────────────────────

const SQL_SCHEMA = `-- Two tables + a JOIN to read one loopback result

CREATE TABLE test_runs (
  id          SERIAL PRIMARY KEY,
  device_id   VARCHAR(32) NOT NULL,
  pattern_id  VARCHAR(64),
  started_at  TIMESTAMP,
  status      VARCHAR(8),   -- 'pass' | 'fail'
  duration_ms INTEGER
);

CREATE TABLE test_run_components (
  id          SERIAL PRIMARY KEY,
  run_id      INTEGER REFERENCES test_runs(id),
  component_id VARCHAR(32),
  result      VARCHAR(8),
  error_code  VARCHAR(32)
);

-- Reading one full result:
SELECT r.*, c.component_id, c.result, c.error_code
FROM   test_runs r
JOIN   test_run_components c ON c.run_id = r.id
WHERE  r.device_id = 'device-015'
ORDER  BY r.started_at DESC LIMIT 1;`;

const MDB_DOC = `// One document — no JOIN needed
{
  "_id": ObjectId("..."),
  "device_id": "device-015",
  "pattern_id": "loopback_v1",
  "started_at": ISODate("2026-05-29T15:43:00Z"),
  "status": "fail",
  "duration_ms": 412,
  "results": {
    "overall": "fail",
    "components": [         // embedded — no JOIN
      {
        "component_id": "pcie_card_1",
        "result": "fail",
        "error_code": "LB_TIMEOUT",
        "core_results": [
          { "core_id": "core_0", "result": "fail" },
          { "core_id": "core_1", "result": "pass" }
        ]
      },
      { "component_id": "pcie_card_2", "result": "pass" }
    ]
  }
}`;

const TABLE1_COLS = [
  { name: "id",          type: "SERIAL",       pk: true  },
  { name: "device_id",   type: "VARCHAR(32)",  fk: false },
  { name: "pattern_id",  type: "VARCHAR(64)",  fk: false },
  { name: "started_at",  type: "TIMESTAMP",    fk: false },
  { name: "status",      type: "VARCHAR(8)",   fk: false },
  { name: "duration_ms", type: "INTEGER",      fk: false },
];
const TABLE2_COLS = [
  { name: "id",           type: "SERIAL",      pk: true  },
  { name: "run_id",       type: "INTEGER",     fk: true  },
  { name: "component_id", type: "VARCHAR(32)", fk: false },
  { name: "result",       type: "VARCHAR(8)",  fk: false },
  { name: "error_code",   type: "VARCHAR(32)", fk: false },
];

function ERDiagram() {
  return (
    <div className="flex flex-col gap-4 h-full">
      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold text-center">
        Entity Relationship Diagram
      </p>

      <div className="flex items-start gap-2 flex-1">
        {/* test_runs */}
        <div className="flex-1 border-2 border-blue-400 rounded-lg overflow-hidden min-w-0">
          <div className="bg-blue-600 px-3 py-2 text-xs font-bold text-white text-center tracking-wide">
            test_runs
          </div>
          <div className="divide-y divide-slate-200">
            {TABLE1_COLS.map((col) => (
              <div key={col.name} className={`flex items-center gap-1.5 px-2.5 py-1.5 ${col.pk ? "bg-amber-50" : "bg-white"}`}>
                <span className="text-[11px] w-4 text-center shrink-0">{col.pk ? "🔑" : "·"}</span>
                <span className={`font-mono text-[11px] truncate ${col.pk ? "text-amber-700 font-bold" : "text-slate-700"}`}>{col.name}</span>
                <span className="ml-auto font-mono text-[10px] text-cyan-700 shrink-0">{col.type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Connector */}
        <div className="flex flex-col items-center shrink-0 pt-8 gap-0.5 w-14">
          <span className="text-sm font-bold text-blue-600 mb-1">1</span>
          <div className="w-full h-0.5 bg-blue-400" />
          <div className="flex flex-col items-center -mt-0.5">
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-blue-400" />
          </div>
          <span className="text-[9px] font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-300 my-1">JOIN</span>
          <div className="flex flex-col items-center -mb-0.5">
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-orange-400" />
          </div>
          <div className="w-full h-0.5 bg-orange-400" />
          <span className="text-sm font-bold text-orange-600 mt-1">N</span>
        </div>

        {/* test_run_components */}
        <div className="flex-1 border-2 border-orange-400 rounded-lg overflow-hidden min-w-0">
          <div className="bg-orange-600 px-3 py-2 text-xs font-bold text-white text-center tracking-wide">
            test_run_components
          </div>
          <div className="divide-y divide-slate-200">
            {TABLE2_COLS.map((col) => (
              <div key={col.name} className={`flex items-center gap-1.5 px-2.5 py-1.5 ${col.pk ? "bg-amber-50" : col.fk ? "bg-orange-50" : "bg-white"}`}>
                <span className="text-[11px] w-4 text-center shrink-0">{col.pk ? "🔑" : col.fk ? "🔗" : "·"}</span>
                <span className={`font-mono text-[11px] truncate ${col.pk ? "text-amber-700 font-bold" : col.fk ? "text-orange-700 font-bold" : "text-slate-700"}`}>{col.name}</span>
                <span className="ml-auto font-mono text-[10px] text-cyan-700 shrink-0">{col.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* JOIN statement */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 text-xs font-mono text-slate-600 text-center">
        <span className="text-blue-700 font-bold">JOIN</span>
        {" test_run_components c "}
        <span className="text-blue-700 font-bold">ON</span>
        {" c.run_id = r.id"}
      </div>

      <p className="text-[10px] text-slate-400 text-center leading-relaxed">
        Every loopback read must cross this JOIN — 20 devices × many runs = many paired reads
      </p>
    </div>
  );
}

function SqlFlipCard() {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="border-2 border-blue-300 rounded-xl overflow-hidden flex flex-col bg-white">
      {/* Header */}
      <div className="bg-blue-50 px-4 py-2.5 flex items-center justify-between border-b border-blue-200 shrink-0">
        <span className="text-sm font-bold text-blue-800">SQL — Normalized (2 tables)</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-blue-600 font-mono font-semibold">PostgreSQL</span>
          <button
            onClick={() => setFlipped((f) => !f)}
            className="text-[10px] bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white px-2.5 py-0.5 rounded-full transition-colors font-semibold"
          >
            {flipped ? "{ } code" : "⊞ diagram"}
          </button>
        </div>
      </div>

      {/* Flip container */}
      <div className="relative flex-1" style={{ perspective: "1200px", minHeight: "420px" }}>
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            transformStyle: "preserve-3d",
            transition: "transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front — SQL code */}
          <div className="absolute inset-0 overflow-auto" style={{ backfaceVisibility: "hidden" }}>
            <pre className="text-xs text-slate-700 p-4 leading-relaxed bg-slate-50 min-h-full">
              <SqlDoc code={SQL_SCHEMA} />
            </pre>
          </div>

          {/* Back — ER diagram */}
          <div
            className="absolute inset-0 bg-white p-5 overflow-auto"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <ERDiagram />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-blue-50 px-4 py-2 text-[11px] text-blue-700 border-t border-blue-200 font-semibold shrink-0">
        ⚠ Every read of a full result requires a JOIN across 2 tables
      </div>
    </div>
  );
}

function DocumentModelPanel() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* SQL — flip card */}
      <SqlFlipCard />

      {/* MongoDB */}
      <div className="border-2 border-emerald-300 rounded-xl overflow-hidden flex flex-col bg-white">
        <div className="bg-emerald-50 px-4 py-2.5 flex items-center justify-between border-b border-emerald-200 shrink-0">
          <span className="text-sm font-bold text-emerald-800">MongoDB — Embedded document</span>
          <span className="text-[11px] text-emerald-600 font-mono font-semibold">Atlas</span>
        </div>
        <pre className="text-xs text-slate-700 p-4 overflow-auto leading-relaxed bg-slate-50 flex-1" style={{ minHeight: "420px" }}>
          <JsonDoc code={MDB_DOC} />
        </pre>
        <div className="bg-emerald-50 px-4 py-2 text-[11px] text-emerald-700 border-t border-emerald-200 font-semibold shrink-0">
          ✓ One <span className="font-mono">find()</span> call returns the full result — components included
        </div>
      </div>
    </div>
  );
}

// ── 3. Feature cards ─────────────────────────────────────────────────────────

interface Feature {
  title: string;
  sqlEquiv: string;
  mgEquiv: string;
  where: string;
  why: string;
  code: string;
  codeLabel: string;
  color: "green" | "blue" | "teal" | "amber";
}

const FEATURES: Feature[] = [
  {
    title: "Change Streams",
    sqlEquiv: "TRIGGER AFTER INSERT + LISTEN/NOTIFY",
    mgEquiv: "Change Stream",
    where: "Powers every live LED update on the fleet page",
    why: "Any time a test_run document is written to Atlas, the backend receives a real-time event and pushes it to the browser via SSE — no polling the DB.",
    code: `// FastAPI: subscribe to Change Stream
async for change in collection.watch():
    notify_sse(
        change["fullDocument"]["device_id"],
        change["fullDocument"]["led_state"]
    )`,
    codeLabel: "Python (Motor + FastAPI SSE)",
    color: "green",
  },
  {
    title: "Aggregation Pipeline",
    sqlEquiv: "SELECT … GROUP BY … WHERE … ORDER BY",
    mgEquiv: "$match → $group → $sort → $limit",
    where: "Alert threshold check and Explorer queries",
    why: "Each stage passes its output to the next — like chaining SQL clauses. More composable than SQL for nested data, and runs entirely inside Atlas.",
    code: `// Alert: failure rate over last 15 runs
[
  { "$match": { "device_id": "device-015" } },
  { "$sort": { "started_at": -1 } },
  { "$limit": 15 },
  { "$group": {
      "_id": null,
      "failures": { "$sum": {
        "$cond": [{ "$eq": ["$status","fail"] }, 1, 0]
      }}
  }}
]`,
    codeLabel: "MongoDB aggregation pipeline",
    color: "blue",
  },
  {
    title: "Atlas Vector Search",
    sqlEquiv: "No direct SQL equivalent",
    mgEquiv: "$vectorSearch",
    where: "Fault isolation chain — finding similar past failures",
    why: "Each failure description is embedded as a 1,024-dim vector stored directly on the document. $vectorSearch finds semantically similar past failures — not just keyword matches — right inside the same Atlas cluster.",
    code: `// Find similar failures by meaning, not keywords
[
  { "$vectorSearch": {
      "index": "test_runs_vector_idx",
      "path": "embedding",
      "queryVector": <precomputed_1024_dim_vector>,
      "numCandidates": 100,
      "limit": 7
  }},
  { "$project": { "embedding": 0, "score": {
      "$meta": "vectorSearchScore"
  }}}
]`,
    codeLabel: "Atlas $vectorSearch pipeline",
    color: "teal",
  },
  {
    title: "Embedded Documents",
    sqlEquiv: "Child table + JOIN",
    mgEquiv: "Nested objects / arrays in a document",
    where: "test_runs.results.components[] — PCIe card results",
    why: "Component results (pcie_card_1, 2, 3) live inside the same document as the test run. No JOIN needed — one read gets everything. The core grid renders from a single document fetch.",
    code: `// Query: which runs had pcie_card_1 failures?
// No JOIN — query the nested array directly
db.test_runs.find({
  "results.components": {
    "$elemMatch": {
      "component_id": "pcie_card_1",
      "result": "fail"
    }
  }
})

// SQL equivalent would require:
// SELECT r.* FROM test_runs r
// JOIN test_run_components c ON c.run_id = r.id
// WHERE c.component_id = 'pcie_card_1'
//   AND c.result = 'fail'`,
    codeLabel: "MongoDB vs SQL equivalent",
    color: "amber",
  },
];

const FEATURE_STYLES = {
  green:  { border: "border-emerald-300", header: "bg-emerald-50 border-emerald-200", title: "text-emerald-800" },
  blue:   { border: "border-blue-300",    header: "bg-blue-50 border-blue-200",       title: "text-blue-800"   },
  teal:   { border: "border-[#009999]",   header: "bg-[#f0fafa] border-[#009999]",    title: "text-[#005159]"  },
  amber:  { border: "border-amber-300",   header: "bg-amber-50 border-amber-200",     title: "text-amber-800"  },
};

function FeatureCard({ f }: { f: Feature }) {
  const [open, setOpen] = useState(false);
  const s = FEATURE_STYLES[f.color];
  return (
    <div className={`border-2 ${s.border} rounded-xl overflow-hidden bg-white`}>
      <div className={`border-b ${s.header} px-5 py-4`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className={`text-base font-bold ${s.title}`}>{f.title}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <SqlBadge label={f.sqlEquiv} />
              <span className="text-slate-400 text-xs font-bold">→</span>
              <MgBadge label={f.mgEquiv} />
            </div>
          </div>
          <span className="text-xs text-slate-500 border border-slate-300 bg-white rounded px-2 py-0.5 shrink-0">
            used in: {f.where}
          </span>
        </div>
        <p className="text-sm text-slate-700 mt-3 leading-relaxed">{f.why}</p>
      </div>

      <div className="bg-white">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-colors font-semibold"
        >
          <span>Show code example</span>
          <span>{open ? "▾" : "▸"}</span>
        </button>
        {open && (
          <pre className="text-xs text-slate-700 px-5 pb-5 overflow-auto leading-relaxed bg-slate-50">
            <GenericCode code={f.code} />
          </pre>
        )}
      </div>
    </div>
  );
}

// ── 4. Benefits flip-cards ────────────────────────────────────────────────────

const BENEFITS: {
  index: string;
  title: string;
  bullets: string[];
  contrast: string;
  sqlLines: { text: string; keywords: string[] }[];
}[] = [
  {
    index: "01",
    title: "One document = one read",
    bullets: [
      "Component results are embedded directly in the test_run document",
      "Reading a full device history = one indexed find() call",
      "No JOIN, no secondary collection scan",
    ],
    contrast: "Relational equivalent",
    sqlLines: [
      { text: "SELECT * FROM test_runs", keywords: ["SELECT", "FROM"] },
      { text: "JOIN test_run_components USING (run_id)", keywords: ["JOIN", "USING"] },
      { text: "WHERE device_id = ?", keywords: ["WHERE"] },
      { text: "-- two table scans + index merge + result assembly", keywords: ["--"] },
    ],
  },
  {
    index: "02",
    title: "Write-heavy ingest, no migrations",
    bullets: [
      "20 devices × 1 run/10s = 7,200 documents/hour sustained",
      "New PCIe card? Add the field — existing documents are unaffected",
      "No ALTER TABLE, no table lock, no coordinated rollout",
    ],
    contrast: "Relational equivalent",
    sqlLines: [
      { text: "ALTER TABLE test_runs", keywords: ["ALTER", "TABLE"] },
      { text: "  ADD COLUMN pcie_card_3 JSONB;", keywords: ["ADD", "COLUMN"] },
      { text: "-- table-level lock in most engines", keywords: ["--"] },
      { text: "-- blocks all fleet writes during rollout", keywords: ["--"] },
    ],
  },
  {
    index: "03",
    title: "Real-time without a separate bus",
    bullets: [
      "Change Streams emit every insert — Atlas is the event bus",
      "No Kafka, no Redis Pub/Sub, no additional infrastructure",
      "Same cluster that stores data also pushes live updates",
    ],
    contrast: "Relational equivalent",
    sqlLines: [
      { text: "LISTEN test_run_channel;", keywords: ["LISTEN"] },
      { text: "-- only works on a single PostgreSQL node", keywords: ["--"] },
      { text: "-- multi-consumer fan-out requires", keywords: ["--"] },
      { text: "--   a separate message broker (Kafka / Redis)", keywords: ["--"] },
    ],
  },
  {
    index: "04",
    title: "Vector + operational in one store",
    bullets: [
      "Fault embeddings live as a field inside each test_run document",
      "$vectorSearch runs inside Atlas — no Pinecone, no Weaviate",
      "No ETL pipeline to keep embeddings in sync",
    ],
    contrast: "Relational equivalent",
    sqlLines: [
      { text: "-- operational DB (PostgreSQL + pgvector)", keywords: ["--"] },
      { text: "+ separate vector store (Pinecone / Weaviate)", keywords: [] },
      { text: "+ nightly ETL job to sync embeddings", keywords: [] },
      { text: "-- three systems, three failure surfaces", keywords: ["--"] },
    ],
  },
  {
    index: "05",
    title: "Flexible querying on nested data",
    bullets: [
      "$elemMatch targets a specific component inside the results array",
      "No child table JOIN — filter happens inside the document",
      "Telemetry Query translates plain English to these pipelines",
    ],
    contrast: "Relational equivalent",
    sqlLines: [
      { text: "SELECT * FROM test_runs r", keywords: ["SELECT", "FROM"] },
      { text: "JOIN test_run_components c ON r.id = c.run_id", keywords: ["JOIN", "ON"] },
      { text: "WHERE c.component_id = 'pcie_card_1'", keywords: ["WHERE"] },
      { text: "-- query plan grows with component cardinality", keywords: ["--"] },
    ],
  },
  {
    index: "06",
    title: "Fully managed, zero infra",
    bullets: [
      "Multi-cloud, built-in indexes, backups, and monitoring included",
      "No servers to provision, no connection pooler to operate",
      "Atlas Search and Vector Search run on the same cluster",
    ],
    contrast: "Relational equivalent",
    sqlLines: [
      { text: "-- self-managed PostgreSQL instance", keywords: ["--"] },
      { text: "+ pgvector extension", keywords: [] },
      { text: "+ PgBouncer connection pooler", keywords: [] },
      { text: "+ backup agent   -- four separate ops surfaces", keywords: ["--"] },
    ],
  },
];

// Highlight SQL keywords on the back of the card
const SQL_KW_COLOR = "#F5A623"; // Siemens amber — standard syntax-highlight token color
const SQL_COMMENT_COLOR = "#6b8a6b";

function SqlLine({ text, keywords }: { text: string; keywords: string[] }) {
  if (text.trimStart().startsWith("--")) {
    return <span style={{ color: SQL_COMMENT_COLOR }}>{text}</span>;
  }
  if (keywords.length === 0) {
    return <span className="text-slate-300">{text}</span>;
  }
  const parts: React.ReactNode[] = [];
  let remaining = text;
  keywords.forEach((kw) => {
    const idx = remaining.indexOf(kw);
    if (idx === -1) return;
    if (idx > 0) parts.push(<span key={`pre-${kw}`} className="text-slate-300">{remaining.slice(0, idx)}</span>);
    parts.push(<span key={kw} style={{ color: SQL_KW_COLOR }} className="font-semibold">{kw}</span>);
    remaining = remaining.slice(idx + kw.length);
  });
  if (remaining) parts.push(<span key="tail" className="text-slate-300">{remaining}</span>);
  return <>{parts}</>;
}

function BenefitFlipCard({ b }: { b: (typeof BENEFITS)[0] }) {
  const [flipped, setFlipped] = useState(false);
  const PETROL = "#009999";
  return (
    <div
      className="cursor-pointer"
      style={{ perspective: "1000px", height: "210px" }}
      onClick={() => setFlipped((f) => !f)}
      title={flipped ? "Click to see MongoDB advantage" : "Click to compare with relational"}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.45s cubic-bezier(0.4,0,0.2,1)",
          transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
        }}
      >
        {/* Front — MongoDB advantage */}
        <div
          style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between"
        >
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-mono font-bold" style={{ color: PETROL }}>{b.index}</span>
              <h3 className="text-sm font-bold text-slate-900 leading-snug">{b.title}</h3>
            </div>
            <ul className="space-y-1">
              {b.bullets.map((pt, i) => (
                <li key={i} className="flex items-start gap-2 text-[12px] text-slate-600 leading-snug">
                  <span className="mt-[3px] shrink-0 w-1 h-1 rounded-full" style={{ background: PETROL }} />
                  {pt}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">Flip to compare with relational →</p>
        </div>

        {/* Back — SQL contrast with syntax highlighting */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "#000028",
          }}
          className="rounded-xl p-4 shadow-sm flex flex-col justify-between border border-slate-700"
        >
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-mono font-bold" style={{ color: PETROL }}>{b.index}</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{b.contrast}</span>
            </div>
            <pre className="text-[11px] font-mono leading-relaxed space-y-0 whitespace-pre-wrap">
              {b.sqlLines.map((line, i) => (
                <div key={i}><SqlLine text={line.text} keywords={line.keywords} /></div>
              ))}
            </pre>
          </div>
          <p className="text-[10px] text-slate-600 mt-2 pt-2 border-t border-slate-800">← Flip back</p>
        </div>
      </div>
    </div>
  );
}

function BenefitsGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {BENEFITS.map((b) => (
        <BenefitFlipCard key={b.index} b={b} />
      ))}
    </div>
  );
}

// ── 0. Why this exists (ByteDance paper POV) ─────────────────────────────────

const DETECTION_ROWS = [
  { failure: "NIC crash",        withMonitoring: "30 s",  without: "~10 min", note: "NIC/network sensor_type" },
  { failure: "GPU driver hang",  withMonitoring: "10 s",  without: "~10 min", note: "process hang detection" },
  { failure: "OS kernel fault",  withMonitoring: "2 s",   without: "~10 min", note: "kernel event sensor" },
  { failure: "PCIe degradation", withMonitoring: "pre-warn via thermal trend", without: "hard crash / timeout", note: "telemetry time-series — what SoCPulse adds" },
];

function WhyItExistsSection() {
  return (
    <section className="space-y-6">
      <SectionHeader
        title="Why This Exists"
        subtitle={`The analytical foundation — "Robust LLM Training Infrastructure at ByteDance" (SOSP '25, arXiv:2509.16293)`}
      />

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-sm">
        <p className="text-sm text-slate-700 leading-relaxed">
          ByteDance published a study of <span className="text-slate-900 font-semibold">778,135 training jobs</span> over 3 months
          on GPU clusters. The core finding: without real-time sensor monitoring, infrastructure teams wait for a process timeout
          (NCCL, PyTorch Distributed) to learn hardware has already failed — burning 10+ minutes of GPU cycles per incident.
        </p>
        <p className="text-sm text-slate-600 leading-relaxed">
          SoCPulse applies that same principle to <span className="text-slate-900 font-semibold">server / BMC hardware</span>:{" "}
          if you wait for a hard crash to detect a PCIe link degrading from x16 to x1, you have already lost significant
          operational time. The telemetry time-series collection is specifically designed to surface the pre-warning signal —
          temperature rising <em>before</em> the LED changes.
        </p>
      </div>

      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold mb-3">
          Table 3 — Detection time: with vs without proactive monitoring
        </p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-slate-600 font-semibold">Failure type</th>
                <th className="text-left px-4 py-2.5 text-emerald-700 font-semibold">With monitoring</th>
                <th className="text-left px-4 py-2.5 text-red-600 font-semibold">Without monitoring</th>
                <th className="text-left px-4 py-2.5 text-slate-500 font-semibold">SoCPulse mapping</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {DETECTION_ROWS.map((r, i) => (
                <tr key={r.failure} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                  <td className="px-4 py-2.5 font-mono text-slate-700">{r.failure}</td>
                  <td className="px-4 py-2.5 text-emerald-700 font-semibold">{r.withMonitoring}</td>
                  <td className="px-4 py-2.5 text-red-600">{r.without}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-2">
          Source: ByteDance SOSP &apos;25 (arXiv:2509.16293) Table 3 — rows 1–3 from the paper; row 4 is SoCPulse&apos;s extension to BMC hardware.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { pct: "71%",   label: "Explicit failures",  desc: "Clear error signal. 2–15 min to localize with proactive monitoring.", color: "border-red-300 bg-red-50" },
          { pct: "10%+",  label: "Implicit failures",  desc: "No error. Job hangs, MFU decline, silent data corruption. Can take 1.5+ hours manually.", color: "border-amber-300 bg-amber-50" },
          { pct: "17.3%", label: "Human-introduced",   desc: "Manual restarts are as significant a failure source as hardware.", color: "border-slate-300 bg-slate-50" },
        ].map((s) => (
          <div key={s.label} className={`border-2 rounded-xl p-4 ${s.color}`}>
            <div className="text-2xl font-bold text-slate-900 mb-1">{s.pct}</div>
            <div className="text-sm font-semibold text-slate-700 mb-1">{s.label}</div>
            <div className="text-xs text-slate-600 leading-relaxed">{s.desc}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border-l-4 border-l-teal-500 border border-slate-200 rounded-xl px-5 py-4 shadow-sm">
        <p className="text-sm text-slate-700 leading-relaxed">
          <span className="font-semibold text-slate-900">The implicit failure category is where SoCPulse focuses.</span>{" "}
          The diagnostic chain — vector search over past incidents, root cause analysis, work order generation — compresses what took
          engineers 1.5+ hours into a structured output in seconds. The telemetry time-series collection
          captures the pre-warning signal that makes explicit failures detectable before they become downtime.
        </p>
      </div>
    </section>
  );
}

// ── 5. Collections reference ──────────────────────────────────────────────────

const COLLECTIONS = [
  {
    name: "devices",
    sqlEquiv: "devices table",
    type: "Standard document",
    points: [
      "Device registry with a state machine: online → maintenance → offline",
      "Hardware metadata per device (rack, server, PCIe slot)",
      "Tracks latched failures until an operator clears them",
    ],
    key: "device_id (unique), location.datacenter + status compound",
  },
  {
    name: "telemetry",
    sqlEquiv: "No direct SQL equivalent — closest is TimescaleDB hypertable",
    type: "Native time-series collection",
    points: [
      "Continuous sensor readings per device",
      "timeField: ts · metaField: meta (device_id, sensor_type)",
      "Automatic bucketing — approx. 70–90% storage reduction",
      "Thermal baseline here is the pre-warning signal",
    ],
    key: "{ meta.device_id: 1, ts: -1 } secondary index",
    highlight: true,
  },
  {
    name: "test_runs",
    sqlEquiv: "test_runs + test_run_components (2 tables)",
    type: "Standard document + vector index",
    points: [
      "Deterministic test pattern results with embedded component/core results",
      "1,024-dim embedding for vector similarity search — stored on the document",
      "Primary corpus for fault isolation similarity retrieval",
    ],
    key: "(device_id, started_at), vector index: test_runs_vector_idx",
  },
  {
    name: "alerts",
    sqlEquiv: "alerts table",
    type: "Standard document",
    points: [
      "Failure events auto-created when failure rate exceeds 10%",
      "Linked to the test_runs supporting the signal",
    ],
    key: "(device_id, status, triggered_at)",
  },
  {
    name: "agent_runs",
    sqlEquiv: "No SQL equivalent — audit log of diagnostic chain executions",
    type: "Standard document",
    points: [
      "Full trace of every diagnostic chain run: input, retrieved docs, tool calls, output",
      "Captures prediction + root cause + work order for each run",
      "Grows into a knowledge base — future fault analyses query past high-confidence hypotheses",
    ],
    key: "(agent_type, created_at)",
  },
];

function CollectionsTable() {
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Collections Reference"
        subtitle="Five collections in the pulse_bmc database — each mapped to its SQL equivalent"
      />
      <div className="space-y-3">
        {COLLECTIONS.map((c) => (
          <div
            key={c.name}
            className={`border rounded-xl overflow-hidden bg-white shadow-sm ${c.highlight ? "border-teal-400" : "border-slate-200"}`}
          >
            <div className={`flex items-start justify-between gap-4 px-5 py-3 border-b flex-wrap ${c.highlight ? "bg-teal-50 border-teal-200" : "bg-slate-50 border-slate-200"}`}>
              <div className="flex items-center gap-3 flex-wrap">
                <span className={`font-mono text-sm font-bold ${c.highlight ? "text-teal-700" : "text-slate-800"}`}>{c.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${c.highlight ? "bg-teal-100 border-teal-300 text-teal-700" : "bg-white border-slate-300 text-slate-500"}`}>
                  {c.type}
                </span>
              </div>
              <SqlBadge label={c.sqlEquiv} />
            </div>
            <div className="px-5 py-3 bg-white space-y-2">
              <ul className="space-y-1">
                {c.points.map((p) => (
                  <li key={p} className="flex gap-2 text-sm text-slate-700 leading-relaxed">
                    <span className={`mt-1.5 h-1 w-1 rounded-full shrink-0 ${c.highlight ? "bg-teal-500" : "bg-slate-400"}`} />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] font-mono text-slate-400 border-t border-slate-100 pt-2">Indexes: {c.key}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── 6. MongoDB vs alternative stacks ─────────────────────────────────────────

const ALT_STACKS = [
  {
    vs: "Postgres + TimescaleDB",
    problem: "Two separate products to operate. TimescaleDB handles time-series but not vector search. A third tool (pgvector or Pinecone) is needed for embeddings. Schema migrations required when new hardware classes appear.",
    mongodb: "One Atlas cluster handles time-series (native collection), document store, and vector search. New hardware types are addable without migrations.",
  },
  {
    vs: "InfluxDB + Postgres + Pinecone",
    problem: "Three products, three query languages, three operational surfaces. ETL pipelines connect them. Joins across stores require application-layer code.",
    mongodb: "Telemetry, structured records, and 1,024-dim vectors all live in the same database, queried with the same aggregation pipeline.",
  },
  {
    vs: "Relational schema for evidence",
    problem: "PCIe failures, thermal anomalies, NIC events, and silent data corruption all have different evidence fields. A relational schema forces nullable columns or an EAV table — both are hard to query.",
    mongodb: "The evidence subdoc varies by failure type. Each document embeds exactly the fields relevant to its failure class. No nullable columns, no schema migration when a new failure type is added.",
  },
];

function AlternativeStacksSection() {
  return (
    <section className="space-y-4">
      <SectionHeader
        title="Why MongoDB Instead of the Typical Stack"
        subtitle="The alternative stacks and why they fragment for this specific workload"
      />
      <div className="space-y-3">
        {ALT_STACKS.map((s) => (
          <div key={s.vs} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-slate-50">
              <span className="text-xs font-mono text-red-600 bg-red-50 border border-red-200 rounded px-2 py-0.5">vs</span>
              <span className="text-sm font-semibold text-slate-700">{s.vs}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200">
              <div className="px-5 py-4">
                <p className="text-[10px] text-red-500 uppercase tracking-wide font-semibold mb-1.5">Problem with that stack</p>
                <p className="text-sm text-slate-600 leading-relaxed">{s.problem}</p>
              </div>
              <div className="px-5 py-4">
                <p className="text-[10px] text-emerald-600 uppercase tracking-wide font-semibold mb-1.5">MongoDB approach</p>
                <p className="text-sm text-slate-700 leading-relaxed">{s.mongodb}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ArchitecturePage() {
  return (
    <PageShell className="bg-[#F4F7F9]">
      <ConceptBar />
      <PageMain maxWidth="doc" className="space-y-10 sm:space-y-14 py-6 sm:py-8">

        {/* Hero */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">How It Works</h1>
          <p className="text-slate-600 mt-2 max-w-2xl text-sm leading-relaxed">
            SoCPulse stores hardware telemetry in MongoDB Atlas — a document database that keeps related data together (no JOINs), streams live changes to the browser, and runs automated fault isolation inside the same cluster.
          </p>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <span className="text-xs text-slate-600 border border-slate-300 bg-white rounded-full px-3 py-1">MongoDB Atlas M0</span>
            <span className="text-xs text-slate-600 border border-slate-300 bg-white rounded-full px-3 py-1">FastAPI + Motor (async Python)</span>
            <span className="text-xs text-slate-600 border border-slate-300 bg-white rounded-full px-3 py-1">Next.js + SSE</span>
            <span className="text-xs text-slate-600 border border-slate-300 bg-white rounded-full px-3 py-1">Atlas Vector Search (1024-dim)</span>
            <span className="text-xs text-slate-600 border border-slate-300 bg-white rounded-full px-3 py-1">Diagnostic fault isolation chain</span>
          </div>
        </div>

        {/* 0. Why this exists */}
        <WhyItExistsSection />

        {/* 1. System flow */}
        <section>
          <SectionHeader
            title="System Architecture"
            subtitle="Start with the high-level shape, then follow the detailed write, real-time, and diagnostic paths"
          />
          <div className="space-y-4">
            <SimplifiedArchitecture />
            <ArchFlowDiagram />
          </div>
        </section>

        {/* 1b. Collections reference */}
        <CollectionsTable />

        {/* 1c. Diagnostic Chain */}
        <AgentChainSection />

        {/* 2. Document model */}
        <section>
          <SectionHeader
            title="Document Model vs SQL Schema"
            subtitle="The core trade-off: embed component results inside the parent document instead of normalizing into a child table"
          />
          <DocumentModelPanel />
          <div className="mt-3 bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700 leading-relaxed shadow-sm">
            <strong className="text-slate-900">Why this matters:</strong> Every time the fleet page loads a device&apos;s test history, it reads one document per run — no JOIN, no N+1 query problem.
            The core health grid renders from a single <span className="font-mono text-emerald-700">find()</span> result.
            In SQL this would require a JOIN across two tables on every page load, multiplied by 20 devices.
          </div>
        </section>

        {/* 3. MongoDB features */}
        <section>
          <SectionHeader
            title="MongoDB Features In Use"
            subtitle="Four Atlas capabilities in use — each mapped to its SQL equivalent"
          />
          <div className="space-y-4">
            {FEATURES.map((f) => <FeatureCard key={f.title} f={f} />)}
          </div>
        </section>

        {/* 4. Benefits */}
        <section>
          <SectionHeader
            title="Why MongoDB for Hardware Telemetry"
            subtitle="Six concrete advantages over a normalized relational schema for this workload"
          />
          <BenefitsGrid />
        </section>

        {/* 6. Alternative stacks */}
        <AlternativeStacksSection />

      </PageMain>
    </PageShell>
  );
}
