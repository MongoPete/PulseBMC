"use client";
import { useState, type ReactNode } from "react";
import ConceptBar from "@/components/ConceptBar";

// ── Reusable primitives ──────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      {subtitle && <p className="text-sm text-slate-300 mt-1">{subtitle}</p>}
    </div>
  );
}

function SqlBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] bg-blue-800/70 border border-blue-500 text-blue-200 px-1.5 py-0.5 rounded font-mono">
      SQL: {label}
    </span>
  );
}

function MgBadge({ label }: { label: string }) {
  return (
    <span className="text-[10px] bg-emerald-800/70 border border-emerald-500 text-emerald-200 px-1.5 py-0.5 rounded font-mono">
      MDB: {label}
    </span>
  );
}

// ── Syntax highlighting ──────────────────────────────────────────────────────

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
    if (fn)      return <span key={k}><span className="text-violet-300 font-semibold">{fn}</span><span className="text-slate-500">(</span><span className="text-amber-300">{fnArg}</span><span className="text-slate-500">)</span></span>;
    if (keyStr)  return <span key={k}><span className="text-sky-300 font-semibold">{keyStr}</span><span className="text-slate-400">{keyColon}</span></span>;
    if (valStr)  return <span key={k} className="text-amber-300">{valStr}</span>;
    if (bool)    return <span key={k} className="text-rose-300 font-semibold">{bool}</span>;
    if (num)     return <span key={k} className="text-orange-300">{num}</span>;
    if (op)      return <span key={k} className="text-emerald-400 font-semibold">{op}</span>;
    return <span key={k}>{full}</span>;
  })}</>;
}

// Groups: 1=comment  2=string  3=num  4=keyword  5=type
const SQL_RE = /(--[^\n]*)|('[^']*')|([-]?\d+(?:\.\d+)?)|(\b(?:SELECT|FROM|WHERE|JOIN|ON|ORDER|BY|LIMIT|GROUP|CREATE|TABLE|INSERT|INTO|REFERENCES|PRIMARY|KEY|NOT|NULL|AND|OR|AS|LEFT|INNER|ALTER|ADD|COLUMN|DISTINCT|HAVING|SERIAL)\b)|(\b(?:VARCHAR|INTEGER|TIMESTAMP|BOOLEAN|TEXT|BIGINT|FLOAT)\b)/gim;

function SqlDoc({ code }: { code: string }) {
  return <>{tokenize(code, SQL_RE, ([full, comment, str, num, kw, type], k) => {
    if (comment) return <span key={k} className="text-slate-400 italic">{comment}</span>;
    if (str)     return <span key={k} className="text-amber-300">{str}</span>;
    if (num)     return <span key={k} className="text-orange-300">{num}</span>;
    if (kw)      return <span key={k} className="text-blue-300 font-semibold">{kw}</span>;
    if (type)    return <span key={k} className="text-cyan-300">{type}</span>;
    return <span key={k}>{full}</span>;
  })}</>;
}

// Groups: 1=comment  2=string  3=placeholder  4=$op  5=keyword  6=num
const GEN_RE = /(\/\/[^\n]*|#[^\n]*|--[^\n]*)|("[^"]*"|'[^']*')|(<[^>\n]+>)|(\$\w+)|(\b(?:async|for|in|await|def|return|if|elif|else|import|from)\b)|([-]?\d+(?:\.\d+)?)/gm;

function GenericCode({ code }: { code: string }) {
  return <>{tokenize(code, GEN_RE, ([full, comment, str, placeholder, op, kw, num], k) => {
    if (comment)     return <span key={k} className="text-slate-400 italic">{comment}</span>;
    if (str)         return <span key={k} className="text-amber-300">{str}</span>;
    if (placeholder) return <span key={k} className="text-violet-300">{placeholder}</span>;
    if (op)          return <span key={k} className="text-emerald-400 font-semibold">{op}</span>;
    if (kw)          return <span key={k} className="text-blue-300">{kw}</span>;
    if (num)         return <span key={k} className="text-orange-300">{num}</span>;
    return <span key={k}>{full}</span>;
  })}</>;
}

// ── 1. System flow diagram ───────────────────────────────────────────────────

function FlowArrow() {
  return <div className="flex items-center text-slate-300 text-xl px-1 select-none font-bold">→</div>;
}

function FlowBox({
  label, sub, color = "slate",
}: {
  label: string; sub: string; color?: "green" | "blue" | "amber" | "indigo" | "slate";
}) {
  const colors = {
    green:  "border-emerald-500 bg-emerald-900/50 text-emerald-200",
    blue:   "border-blue-500 bg-blue-900/50 text-blue-200",
    amber:  "border-amber-500 bg-amber-900/50 text-amber-200",
    indigo: "border-indigo-500 bg-indigo-900/50 text-indigo-200",
    slate:  "border-slate-500 bg-slate-700/60 text-slate-100",
  };
  return (
    <div className={`border-2 rounded-xl px-4 py-3 text-center min-w-[130px] ${colors[color]}`}>
      <div className="text-sm font-bold">{label}</div>
      <div className="text-[11px] mt-0.5 opacity-90">{sub}</div>
    </div>
  );
}

function ArchFlowDiagram() {
  return (
    <div className="bg-slate-900 border border-slate-600 rounded-xl p-6 space-y-6">
      {/* Main horizontal flow */}
      <div>
        <p className="text-xs text-slate-300 uppercase tracking-wide mb-4 font-bold">Write path — loopback data to Atlas</p>
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
      <div className="border-t border-slate-600" />

      {/* Read + real-time path */}
      <div>
        <p className="text-xs text-slate-300 uppercase tracking-wide mb-4 font-bold">Read path — real-time to browser</p>
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
      <div className="border-t border-slate-600" />

      {/* AI path */}
      <div>
        <p className="text-xs text-slate-300 uppercase tracking-wide mb-4 font-bold">AI path — alert → diagnosis → work order</p>
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
      <p className="text-xs text-slate-300 border-t border-slate-600 pt-3">
        SQL equivalent: the Change Stream is like a stored procedure <span className="font-mono text-blue-300">TRIGGER AFTER INSERT</span> + <span className="font-mono text-blue-300">LISTEN/NOTIFY</span> across a network socket. The aggregation alert check replaces a scheduled <span className="font-mono text-blue-300">GROUP BY</span> job.
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
        <div className="flex-1 border-2 border-blue-500 rounded-lg overflow-hidden min-w-0">
          <div className="bg-blue-800 px-3 py-2 text-xs font-bold text-white text-center tracking-wide">
            test_runs
          </div>
          <div className="divide-y divide-slate-700/50">
            {TABLE1_COLS.map((col) => (
              <div key={col.name} className={`flex items-center gap-1.5 px-2.5 py-1.5 ${col.pk ? "bg-yellow-950/40" : "bg-slate-950"}`}>
                <span className="text-[11px] w-4 text-center shrink-0">{col.pk ? "🔑" : "·"}</span>
                <span className={`font-mono text-[11px] truncate ${col.pk ? "text-yellow-300 font-bold" : "text-slate-200"}`}>{col.name}</span>
                <span className="ml-auto font-mono text-[10px] text-cyan-400 shrink-0">{col.type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Connector */}
        <div className="flex flex-col items-center shrink-0 pt-8 gap-0.5 w-14">
          <span className="text-sm font-bold text-blue-300 mb-1">1</span>
          <div className="w-full h-0.5 bg-blue-400" />
          <div className="flex flex-col items-center -mt-0.5">
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-blue-400" />
          </div>
          <span className="text-[9px] font-mono text-blue-200 bg-blue-900 px-1.5 py-0.5 rounded border border-blue-600 my-1">JOIN</span>
          <div className="flex flex-col items-center -mb-0.5">
            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-orange-400" />
          </div>
          <div className="w-full h-0.5 bg-orange-400" />
          <span className="text-sm font-bold text-orange-300 mt-1">N</span>
        </div>

        {/* test_run_components */}
        <div className="flex-1 border-2 border-orange-500 rounded-lg overflow-hidden min-w-0">
          <div className="bg-orange-900/80 px-3 py-2 text-xs font-bold text-white text-center tracking-wide">
            test_run_components
          </div>
          <div className="divide-y divide-slate-700/50">
            {TABLE2_COLS.map((col) => (
              <div key={col.name} className={`flex items-center gap-1.5 px-2.5 py-1.5 ${col.pk ? "bg-yellow-950/40" : col.fk ? "bg-orange-950/40" : "bg-slate-950"}`}>
                <span className="text-[11px] w-4 text-center shrink-0">{col.pk ? "🔑" : col.fk ? "🔗" : "·"}</span>
                <span className={`font-mono text-[11px] truncate ${col.pk ? "text-yellow-300 font-bold" : col.fk ? "text-orange-300 font-bold" : "text-slate-200"}`}>{col.name}</span>
                <span className="ml-auto font-mono text-[10px] text-cyan-400 shrink-0">{col.type}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* JOIN statement */}
      <div className="bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 text-xs font-mono text-slate-300 text-center">
        <span className="text-blue-300 font-bold">JOIN</span>
        {" test_run_components c "}
        <span className="text-blue-300 font-bold">ON</span>
        {" c.run_id = r.id"}
      </div>

      <p className="text-[10px] text-slate-500 text-center leading-relaxed">
        Every loopback read must cross this JOIN — 20 devices × many runs = many paired reads
      </p>
    </div>
  );
}

function SqlFlipCard() {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="border-2 border-blue-500 rounded-xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-blue-900/60 px-4 py-2.5 flex items-center justify-between border-b border-blue-500 shrink-0">
        <span className="text-sm font-bold text-blue-100">SQL — Normalized (2 tables)</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-blue-300 font-mono font-semibold">PostgreSQL</span>
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
            <pre className="text-xs text-slate-300 p-4 leading-relaxed bg-slate-950 min-h-full">
              <SqlDoc code={SQL_SCHEMA} />
            </pre>
          </div>

          {/* Back — ER diagram */}
          <div
            className="absolute inset-0 bg-slate-900 p-5 overflow-auto"
            style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
          >
            <ERDiagram />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-blue-900/50 px-4 py-2 text-[11px] text-blue-200 border-t border-blue-500 font-semibold shrink-0">
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
      <div className="border-2 border-emerald-500 rounded-xl overflow-hidden flex flex-col">
        <div className="bg-emerald-900/60 px-4 py-2.5 flex items-center justify-between border-b border-emerald-500 shrink-0">
          <span className="text-sm font-bold text-emerald-100">MongoDB — Embedded document</span>
          <span className="text-[11px] text-emerald-300 font-mono font-semibold">Atlas</span>
        </div>
        <pre className="text-xs text-slate-300 p-4 overflow-auto leading-relaxed bg-slate-950 flex-1" style={{ minHeight: "420px" }}>
          <JsonDoc code={MDB_DOC} />
        </pre>
        <div className="bg-emerald-900/50 px-4 py-2 text-[11px] text-emerald-200 border-t border-emerald-500 font-semibold shrink-0">
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
    why: "Component results (pcie_card_1, 2, 3) live inside the same document as the test run. No JOIN needed — one read gets everything. The 16×16 core grid renders from a single document fetch.",
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
  green:  { border: "border-emerald-500", header: "bg-emerald-900/60 border-emerald-500", title: "text-emerald-200" },
  blue:   { border: "border-blue-500",    header: "bg-blue-900/60 border-blue-500",       title: "text-blue-200"   },
  indigo: { border: "border-indigo-500",  header: "bg-indigo-900/60 border-indigo-500",   title: "text-indigo-200" },
  amber:  { border: "border-amber-500",   header: "bg-amber-900/60 border-amber-500",     title: "text-amber-200"  },
};

function FeatureCard({ f }: { f: Feature }) {
  const [open, setOpen] = useState(false);
  const s = FEATURE_STYLES[f.color];
  return (
    <div className={`border-2 ${s.border} rounded-xl overflow-hidden`}>
      <div className={`border-b ${s.header} px-5 py-4`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className={`text-base font-bold ${s.title}`}>{f.title}</h3>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <SqlBadge label={f.sqlEquiv} />
              <span className="text-slate-300 text-xs font-bold">→</span>
              <MgBadge label={f.mgEquiv} />
            </div>
          </div>
          <span className="text-xs text-slate-200 border border-slate-500 bg-slate-700/60 rounded px-2 py-0.5 shrink-0">
            used in: {f.where}
          </span>
        </div>
        <p className="text-sm text-slate-100 mt-3 leading-relaxed">{f.why}</p>
      </div>

      <div className="bg-slate-900">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition-colors font-semibold"
        >
          <span>Show code example</span>
          <span>{open ? "▾" : "▸"}</span>
        </button>
        {open && (
          <pre className="text-xs text-slate-300 px-5 pb-5 overflow-auto leading-relaxed bg-slate-950">
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
        <div key={b.title} className="bg-slate-800 border border-slate-600 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{b.icon}</span>
            <h3 className="text-sm font-bold text-white">{b.title}</h3>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">{b.body}</p>
          <p className="text-[11px] text-slate-400 border-t border-slate-600 pt-2 font-mono leading-relaxed">
            {b.sql}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ArchitecturePage() {
  return (
    <div>
      <ConceptBar />
      <main className="max-w-6xl mx-auto px-4 py-8 space-y-14">

        {/* Hero */}
        <div>
          <h1 className="text-3xl font-bold text-white">How It Works</h1>
          <p className="text-slate-300 mt-2 max-w-2xl text-sm leading-relaxed">
            PulseBMC stores hardware telemetry in MongoDB Atlas — a document database that keeps related data together (no JOINs), streams live changes to the browser, and runs AI-powered root cause analysis inside the same cluster.
          </p>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <span className="text-xs text-slate-200 border border-slate-500 bg-slate-700/60 rounded-full px-3 py-1">MongoDB Atlas M0</span>
            <span className="text-xs text-slate-200 border border-slate-500 bg-slate-700/60 rounded-full px-3 py-1">FastAPI + Motor (async Python)</span>
            <span className="text-xs text-slate-200 border border-slate-500 bg-slate-700/60 rounded-full px-3 py-1">Next.js + SSE</span>
            <span className="text-xs text-slate-200 border border-slate-500 bg-slate-700/60 rounded-full px-3 py-1">Voyage AI embeddings</span>
            <span className="text-xs text-slate-200 border border-slate-500 bg-slate-700/60 rounded-full px-3 py-1">LangChain + GPT-5.5</span>
          </div>
        </div>

        {/* 1. System flow */}
        <section>
          <SectionHeader
            title="System Architecture"
            subtitle="How data flows from a BMC device all the way to the live browser dashboard"
          />
          <ArchFlowDiagram />
        </section>

        {/* 2. Document model */}
        <section>
          <SectionHeader
            title="Document Model vs SQL Schema"
            subtitle="The core trade-off: embed component results inside the parent document instead of normalizing into a child table"
          />
          <DocumentModelPanel />
          <div className="mt-3 bg-slate-800 border border-slate-600 rounded-lg px-4 py-3 text-sm text-slate-200 leading-relaxed">
            <strong className="text-white">Why this matters:</strong> Every time the fleet page loads a device's test history, it reads one document per run — no JOIN, no N+1 query problem.
            The 16×16 core health grid renders from a single <span className="font-mono text-emerald-300">find()</span> result.
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

      </main>
    </div>
  );
}
