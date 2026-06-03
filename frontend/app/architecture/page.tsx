"use client";
import { useState, type ReactNode } from "react";
import ConceptBar from "@/components/ConceptBar";

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
  label: string; sub: string; color?: "green" | "blue" | "amber" | "indigo" | "slate";
}) {
  const colors = {
    green:  "border-emerald-300 bg-emerald-50 text-emerald-800",
    blue:   "border-blue-300 bg-blue-50 text-blue-800",
    amber:  "border-amber-300 bg-amber-50 text-amber-800",
    indigo: "border-indigo-300 bg-indigo-50 text-indigo-800",
    slate:  "border-slate-300 bg-white text-slate-700",
  };
  return (
    <div className={`border-2 rounded-xl px-4 py-3 text-center min-w-[130px] ${colors[color]}`}>
      <div className="text-sm font-bold">{label}</div>
      <div className="text-[11px] mt-0.5 opacity-80">{sub}</div>
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

      {/* AI path */}
      <div>
        <p className="text-xs text-slate-500 uppercase tracking-wide mb-4 font-bold">AI path — alert → diagnosis → work order</p>
        <div className="flex items-center gap-1 flex-wrap">
          <FlowBox label="Alert fires" sub="failure_rate > 10%" color="amber" />
          <FlowArrow />
          <FlowBox label="$vectorSearch" sub="Atlas finds similar failures" color="green" />
          <FlowArrow />
          <FlowBox label="LLM (GPT-5.5)" sub="root cause + work order" color="indigo" />
          <FlowArrow />
          <FlowBox label="agent_runs" sub="logged to Atlas" color="green" />
        </div>
      </div>

      {/* SQL annotation */}
      <p className="text-xs text-slate-500 border-t border-slate-200 pt-3 leading-relaxed">
        SQL equivalent: the Change Stream is like a stored procedure <span className="font-mono text-blue-700">TRIGGER AFTER INSERT</span> + <span className="font-mono text-blue-700">LISTEN/NOTIFY</span> across a network socket. The aggregation alert check replaces a scheduled <span className="font-mono text-blue-700">GROUP BY</span> job.
      </p>
    </div>
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
  color: "green" | "blue" | "indigo" | "amber";
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
    where: "AI root cause RAG — finding similar past failures",
    why: "Voyage AI embeds each failure description into a 1,024-dim vector stored inside the document. $vectorSearch finds semantically similar failures — not just keyword matches — right inside the same Atlas cluster.",
    code: `// Find similar failures by meaning, not keywords
[
  { "$vectorSearch": {
      "index": "test_runs_vector_idx",
      "path": "embedding",
      "queryVector": <voyage_ai_embedding>,
      "numCandidates": 100,
      "limit": 7
  }},
  { "$project": { "embedding": 0, "score": {
      "$meta": "vectorSearchScore"
  }}}
]`,
    codeLabel: "Atlas $vectorSearch pipeline",
    color: "indigo",
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
  indigo: { border: "border-indigo-300",  header: "bg-indigo-50 border-indigo-200",   title: "text-indigo-800" },
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

// ── 4. Benefits grid ─────────────────────────────────────────────────────────

const BENEFITS = [
  {
    icon: "📄",
    title: "One document = one read",
    body: "Component results are embedded in the test_run document. Reading a device's full history never requires a JOIN — just one indexed find().",
    sql: "vs. SELECT with JOIN across test_runs + test_run_components",
  },
  {
    icon: "⚡",
    title: "Write-heavy ingest, no schema migrations",
    body: "20 devices × 1 run/10s = 7,200 documents/hour. New fields (e.g. a new PCIe card) are added to new documents without an ALTER TABLE.",
    sql: "vs. ALTER TABLE … ADD COLUMN (requires table lock in most SQL engines)",
  },
  {
    icon: "🔴",
    title: "Real-time without a separate bus",
    body: "Change Streams turn Atlas into the event bus. No Kafka, no Redis Pub/Sub — the same cluster that stores data also pushes live updates.",
    sql: "vs. PostgreSQL LISTEN/NOTIFY + a separate message broker for scaling",
  },
  {
    icon: "🤖",
    title: "Vector + operational in one store",
    body: "Voyage AI embeddings live as a field inside each test_run document. $vectorSearch runs inside Atlas — no Pinecone, no ETL pipeline, no extra infra.",
    sql: "vs. operational DB + separate vector store (Pinecone/Weaviate) + ETL",
  },
  {
    icon: "🔍",
    title: "Flexible querying on nested data",
    body: "$elemMatch queries nested component arrays without a JOIN. The Explorer page translates plain English into these pipelines on the fly.",
    sql: "vs. subquery or JOIN with WHERE on a normalized child table",
  },
  {
    icon: "☁️",
    title: "Fully managed, zero infra",
    body: "Atlas M0 is free-tier, multi-cloud, with built-in indexes, backups, and monitoring. No servers to provision, no connection pooling to manage.",
    sql: "vs. self-managed PostgreSQL instance + pgvector extension + connection pooler",
  },
];

function BenefitsGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {BENEFITS.map((b) => (
        <div key={b.title} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="text-xl">{b.icon}</span>
            <h3 className="text-sm font-bold text-slate-900">{b.title}</h3>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">{b.body}</p>
          <p className="text-[11px] text-slate-400 border-t border-slate-200 pt-2 font-mono leading-relaxed">
            {b.sql}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── 0. Why this exists (ByteDance paper POV) ─────────────────────────────────

const DETECTION_ROWS = [
  { failure: "NIC crash",        withMonitoring: "30 s",  without: "~10 min", note: "NIC/network sensor_type" },
  { failure: "GPU driver hang",  withMonitoring: "10 s",  without: "~10 min", note: "process hang detection" },
  { failure: "OS kernel fault",  withMonitoring: "2 s",   without: "~10 min", note: "kernel event sensor" },
  { failure: "PCIe degradation", withMonitoring: "pre-warn via thermal trend", without: "hard crash / timeout", note: "telemetry time-series — what PulseBMC adds" },
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
          PulseBMC applies that same principle to <span className="text-slate-900 font-semibold">server / BMC hardware</span>:{" "}
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
                <th className="text-left px-4 py-2.5 text-slate-500 font-semibold">PulseBMC mapping</th>
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
          Source: ByteDance SOSP &apos;25 (arXiv:2509.16293) Table 3 — rows 1–3 from the paper; row 4 is PulseBMC&apos;s extension to BMC hardware.
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
          <span className="font-semibold text-slate-900">The implicit failure category is where PulseBMC focuses.</span>{" "}
          The AI root cause chain — vector search over past incidents, LLM hypothesis, work order — compresses what took
          ByteDance engineers 1.5+ hours into a structured output in seconds. The telemetry time-series collection
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
    purpose: "Device registry — state machine (online → maintenance → offline), hardware metadata, latched failures.",
    key: "device_id (unique), location.datacenter + status compound",
  },
  {
    name: "telemetry",
    sqlEquiv: "No direct SQL equivalent — closest is TimescaleDB hypertable",
    type: "Native time-series collection",
    purpose: "Continuous sensor readings per device. timeField: ts · metaField: meta (device_id, sensor_type). Automatic bucketing gives ~70–90% storage reduction. Thermal baseline stored here is the pre-warning signal.",
    key: "{ meta.device_id: 1, ts: -1 } secondary index",
    highlight: true,
  },
  {
    name: "test_runs",
    sqlEquiv: "test_runs + test_run_components (2 tables)",
    type: "Standard document + vector index",
    purpose: "Loopback test results with embedded component/core results. 1,024-dim Voyage AI embedding for vector similarity search. Primary RAG corpus for root cause analysis.",
    key: "(device_id, started_at), vector index: test_runs_vector_idx",
  },
  {
    name: "alerts",
    sqlEquiv: "alerts table",
    type: "Standard document",
    purpose: "Failure events auto-created when failure rate exceeds 10% threshold. Linked to test_runs supporting the signal.",
    key: "(device_id, status, triggered_at)",
  },
  {
    name: "agent_runs",
    sqlEquiv: "No SQL equivalent — audit log of AI chain executions",
    type: "Standard document",
    purpose: "Full trace of every AI chain run: input, retrieved docs, tool calls, LLM output (prediction + root cause + work order). Grows into a knowledge base — future RCAs query past high-confidence hypotheses.",
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
            <div className="px-5 py-3 bg-white space-y-1.5">
              <p className="text-sm text-slate-700 leading-relaxed">{c.purpose}</p>
              <p className="text-[11px] font-mono text-slate-400">Indexes: {c.key}</p>
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
    <div className="bg-[#F4F7F9] min-h-screen">
      <ConceptBar />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-14">

        {/* Hero */}
        <div>
          <h1 className="text-3xl font-bold text-slate-900">How It Works</h1>
          <p className="text-slate-600 mt-2 max-w-2xl text-sm leading-relaxed">
            PulseBMC stores hardware telemetry in MongoDB Atlas — a document database that keeps related data together (no JOINs), streams live changes to the browser, and runs AI-powered root cause analysis inside the same cluster.
          </p>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <span className="text-xs text-slate-600 border border-slate-300 bg-white rounded-full px-3 py-1">MongoDB Atlas M0</span>
            <span className="text-xs text-slate-600 border border-slate-300 bg-white rounded-full px-3 py-1">FastAPI + Motor (async Python)</span>
            <span className="text-xs text-slate-600 border border-slate-300 bg-white rounded-full px-3 py-1">Next.js + SSE</span>
            <span className="text-xs text-slate-600 border border-slate-300 bg-white rounded-full px-3 py-1">Voyage AI embeddings</span>
            <span className="text-xs text-slate-600 border border-slate-300 bg-white rounded-full px-3 py-1">LangChain + GPT-5.5</span>
          </div>
        </div>

        {/* 0. Why this exists */}
        <WhyItExistsSection />

        {/* 1. System flow */}
        <section>
          <SectionHeader
            title="System Architecture"
            subtitle="How data flows from a BMC device all the way to the live browser dashboard"
          />
          <ArchFlowDiagram />
        </section>

        {/* 1b. Collections reference */}
        <CollectionsTable />

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
            subtitle="Four Atlas capabilities this demo exercises — each mapped to its SQL equivalent"
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

      </main>
    </div>
  );
}
