"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { JsonLight, SqlLight } from "@/components/SyntaxHighlight";
import ConceptBar from "@/components/ConceptBar";
import { api } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

interface StarterQuestion {
  category: string;
  label: string;
  q: string;
  mdb: string;
  sql: string;
}

interface ExploreResult {
  question: string;
  natural_language_summary: string;
  data: Record<string, unknown>[];
  total: number;
  duration_ms: number;
  query_info: {
    collection: string;
    operation: string;
    mongodb_pipeline?: unknown[];
    mongodb_filter?: Record<string, unknown>;
    sql_equivalent: string;
    query_strategy?: string;
    performance_note?: string;
  };
}

interface Facets {
  devices: { total: number; degrading: number };
  alerts: { open: number };
  recent_fails_24h: number;
  pass_24h: number;
  fail_24h: number;
  failure_modes_7d: { mode: string; count: number }[];
  top_failing_devices_24h: { device_id: string; count: number }[];
  meta: { mongodb_note: string };
}

type SortDir = "asc" | "desc" | null;

// ── Starter questions ─────────────────────────────────────────────────────────

const STARTER_QUESTIONS: StarterQuestion[] = [
  {
    category: "Loopback Failures",
    label: "LB_TIMEOUT on pcie_card_1",
    q: "Show loopback test runs where pcie_card_1 failed with LB_TIMEOUT",
    mdb: "$elemMatch on results.components[]",
    sql: "JOIN WHERE component_id='pcie_card_1' AND error_code='LB_TIMEOUT'",
  },
  {
    category: "Loopback Failures",
    label: "Highest failure-rate device",
    q: "Which device has the most loopback_v1 failures in the last 7 days?",
    mdb: "$match → $group → $sort",
    sql: "GROUP BY device_id ORDER BY count DESC",
  },
  {
    category: "Loopback Failures",
    label: "Error code breakdown",
    q: "What loopback error codes appeared most often this week?",
    mdb: "$unwind components → $group error_code",
    sql: "UNNEST + GROUP BY error_code",
  },
  {
    category: "Loopback Failures",
    label: "Signal integrity vs continuity",
    q: "How many SIGNAL_INTEGRITY_ERR vs CONTINUITY_FAIL errors occurred in the last 7 days?",
    mdb: "$unwind → $group error_code",
    sql: "GROUP BY error_code WHERE error_code IN (...)",
  },
  {
    category: "Core-Level IST",
    label: "High core temperature",
    q: "Show loopback runs where any core temperature exceeded 80°C",
    mdb: "$elemMatch on core_results.temp_c",
    sql: "JOIN core_results WHERE temp_c > 80",
  },
  {
    category: "Core-Level IST",
    label: "Core latency outliers",
    q: "Find loopback runs where core latency exceeded 6ms on pcie_card_1",
    mdb: "$unwind → $match latency_ms",
    sql: "JOIN core_results WHERE latency_ms > 6",
  },
  {
    category: "Failure Modes",
    label: "Intermittent loopback failures",
    q: "List intermittent failure mode loopback test runs from the last 7 days",
    mdb: "$match failure_mode='intermittent'",
    sql: "WHERE failure_mode = 'intermittent'",
  },
  {
    category: "Failure Modes",
    label: "Silent CRC corruption",
    q: "Show passing loopback tests where silent CRC corruption was detected",
    mdb: "$match status=pass + corruption_detected",
    sql: "WHERE status='pass' AND corruption_detected=true",
  },
  {
    category: "NVMe Telemetry",
    label: "Rising media errors",
    q: "Which devices have the highest NVMe media_errors count?",
    mdb: "$sort on nvme_smart.media_errors",
    sql: "ORDER BY nvme_smart_media_errors DESC",
  },
  {
    category: "Fleet Ops",
    label: "Failures by datacenter",
    q: "Which datacenter has the most loopback failures in the last 24 hours?",
    mdb: "$lookup devices → $group datacenter",
    sql: "JOIN devices GROUP BY datacenter",
  },
  {
    category: "Fleet Ops",
    label: "Open high-severity alerts",
    q: "Show open alerts with failure rate above 10%",
    mdb: "$match alerts status=open",
    sql: "WHERE status='open' AND failure_rate > 0.10",
  },
  {
    category: "Fleet Ops",
    label: "Alert keyword search",
    q: "Find open alerts mentioning loopback failure threshold",
    mdb: "$search alerts_lexical_idx",
    sql: "FULLTEXT SEARCH on summary (not LIKE/regex)",
  },
  {
    category: "Fault Attribution",
    label: "Upstream controller faults",
    q: "Which upstream PCIe controller is linked to the most loopback failures?",
    mdb: "$group on true_fault_source",
    sql: "GROUP BY true_fault_source",
  },
  {
    category: "Fleet Ops",
    label: "Devices not online",
    q: "Which devices are offline, in maintenance, or degrading?",
    mdb: "$match on devices.status",
    sql: "WHERE status IN ('offline','maintenance','degrading')",
  },
];

const CATEGORIES = ["All", ...Array.from(new Set(STARTER_QUESTIONS.map((q) => q.category)))];


// ── FacetBar component ────────────────────────────────────────────────────────

function FacetBar({ facets, onChip }: { facets: Facets; onChip: (q: string) => void }) {
  const failRate = facets.pass_24h + facets.fail_24h > 0
    ? Math.round((facets.fail_24h / (facets.pass_24h + facets.fail_24h)) * 100)
    : 0;

  return (
    <div id="live-facets" className="rounded-lg border border-slate-200 bg-white px-4 py-3 mb-5">
      <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
          Live Atlas snapshot
        </span>
        <span
          className="text-[10px] font-mono text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded"
          title={facets.meta.mongodb_note}
        >
          $facet · 4 aggregations · 1 round-trip
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <span className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-2.5 py-1">
          <span className="font-semibold">{facets.devices.total}</span>
          <span className="text-slate-400 ml-1">devices</span>
        </span>
        {facets.devices.degrading > 0 && (
          <button
            onClick={() => onChip("Which devices are currently degrading?")}
            className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1 hover:bg-amber-100 transition-colors"
            title="Click to query degrading devices"
          >
            <span className="font-semibold">{facets.devices.degrading}</span>
            <span className="ml-1">degrading</span>
          </button>
        )}
        <button
          onClick={() => onChip("Show all open alerts ordered by severity")}
          className={`text-xs rounded px-2.5 py-1 border transition-colors ${
            facets.alerts.open > 0
              ? "text-red-700 bg-red-50 border-red-200 hover:bg-red-100"
              : "text-slate-600 bg-slate-50 border-slate-200"
          }`}
          title="Click to query open alerts"
        >
          <span className="font-semibold">{facets.alerts.open}</span>
          <span className="ml-1">open alert{facets.alerts.open !== 1 ? "s" : ""}</span>
        </button>
        <span className={`text-xs rounded px-2.5 py-1 border ${
          failRate > 20 ? "text-red-700 bg-red-50 border-red-200" :
          failRate > 5 ? "text-amber-700 bg-amber-50 border-amber-200" :
          "text-slate-600 bg-slate-50 border-slate-200"
        }`}>
          <span className="font-semibold">{facets.fail_24h}</span>
          <span className="text-slate-400 ml-1">fails / 24h</span>
          {failRate > 0 && <span className="ml-1.5 text-[10px] opacity-70">{failRate}%</span>}
        </span>
        {facets.failure_modes_7d.map((fm) => (
          <button
            key={fm.mode}
            onClick={() => onChip(`List test runs where the failure mode is ${fm.mode} in the last 7 days`)}
            className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded px-2.5 py-1 hover:bg-slate-100 transition-colors capitalize"
            title={`Click to query ${fm.mode} failures`}
          >
            <span className="font-semibold">{fm.count}×</span>
            <span className="ml-1">{fm.mode}</span>
          </button>
        ))}
        {facets.top_failing_devices_24h.slice(0, 3).map((d) => (
          <button
            key={d.device_id}
            onClick={() => onChip(`Show all test runs for ${d.device_id} in the last 24 hours`)}
            className="text-xs font-mono text-slate-600 bg-slate-50 border border-slate-200 rounded px-2.5 py-1 hover:bg-slate-100 transition-colors"
            title={`Click to query ${d.device_id}`}
          >
            {d.device_id}
            <span className="ml-1 text-red-500">{d.count}×</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── ResultTable component ─────────────────────────────────────────────────────

function ResultTable({ data }: { data: Record<string, unknown>[] }) {
  const [filter, setFilter] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const keys = data && data.length > 0 ? Object.keys(data[0]).filter((k) => k !== "embedding") : [];

  const filtered = useMemo(() => {
    if (!data || data.length === 0) return [];
    let rows = data;
    if (filter.trim()) {
      const q = filter.toLowerCase();
      rows = rows.filter((row) =>
        keys.some((k) => String(row[k] ?? "").toLowerCase().includes(q))
      );
    }
    if (sortCol && sortDir) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortCol], bv = b[sortCol];
        if (av == null) return 1;
        if (bv == null) return -1;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, filter, sortCol, sortDir]);

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir((d) => d === "asc" ? "desc" : d === "desc" ? null : "asc");
      if (sortDir === "desc") setSortCol(null);
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  if (!data || data.length === 0) return (
    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
      <p className="text-slate-500 text-sm">No matching documents found in Atlas.</p>
    </div>
  );

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "fleet-export.json"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const header = keys.join(",");
    const rows = filtered.map((row) =>
      keys.map((k) => {
        const v = typeof row[k] === "object" ? JSON.stringify(row[k]) : String(row[k] ?? "");
        return `"${v.replace(/"/g, '""')}"`;
      }).join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "fleet-export.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const displayed = filtered.slice(0, 50);
  const isTruncated = filtered.length > 50;

  return (
    <div className="space-y-2">
      {/* Table controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter results…"
          className="flex-1 min-w-[160px] bg-white border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-400"
        />
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {filter ? `${filtered.length} of ${data.length}` : `${data.length}`} rows
          {isTruncated && " (showing 50)"}
        </span>
        <button
          onClick={exportJson}
          className="text-xs px-2.5 py-1.5 border border-slate-200 rounded text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
        >
          ↓ JSON
        </button>
        <button
          onClick={exportCsv}
          className="text-xs px-2.5 py-1.5 border border-slate-200 rounded text-slate-600 hover:bg-slate-50 transition-colors whitespace-nowrap"
        >
          ↓ CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50">
              {keys.map((k) => (
                <th
                  key={k}
                  onClick={() => handleSort(k)}
                  className="text-left px-4 py-2.5 text-slate-600 font-mono font-semibold whitespace-nowrap border-b border-slate-200 tracking-wide cursor-pointer select-none hover:bg-slate-100 transition-colors"
                >
                  {k}
                  {sortCol === k && (
                    <span className="ml-1 text-teal-600">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayed.map((row, i) => (
              <tr key={i} className={`hover:bg-slate-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                {keys.map((k) => {
                  const val = row[k];
                  const display = typeof val === "object" ? JSON.stringify(val) : String(val ?? "—");
                  const isNum = typeof val === "number";
                  const isFail = typeof val === "string" && val === "fail";
                  const isPass = typeof val === "string" && val === "pass";
                  return (
                    <td
                      key={k}
                      className={`px-4 py-2 whitespace-nowrap max-w-xs truncate font-mono ${
                        isFail ? "text-red-600 font-semibold" :
                        isPass ? "text-green-600" :
                        isNum ? "text-amber-700" :
                        "text-slate-700"
                      }`}
                      title={display}
                    >
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExplorePage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ExploreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQuery, setShowQuery] = useState(false);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [timeScope, setTimeScope] = useState<"1h" | "24h" | "7d" | "all">("24h");
  const [history, setHistory] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [ribbonOpen, setRibbonOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.exploreFacets().then((f) => setFacets(f as Facets)).catch(() => {});
  }, []);

  const ask = async (q: string) => {
    // Append time scope context unless already present in question
    let full = q;
    const lq = q.toLowerCase();
    if (timeScope !== "all" && !lq.includes("last") && !lq.includes("hour") && !lq.includes("today")) {
      const scopeLabel = timeScope === "1h" ? "the last hour" : timeScope === "24h" ? "the last 24 hours" : "the last 7 days";
      full = `${q.trimEnd()} in ${scopeLabel}`;
    }

    setQuestion(q);
    setLoading(true);
    setResult(null);
    setError(null);
    setShowQuery(false);
    setHistory((h) => [q, ...h.filter((x) => x !== q)].slice(0, 8));
    try {
      const res = await api.explore(full) as ExploreResult & { error?: string };
      if (res.error) {
        setError(res.error);
      } else {
        setResult(res);
      }
      setShowQuery(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Query failed";
      setError(msg.includes("Failed to fetch") ? "Could not reach the API — is the backend running on port 8000?" : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleChip = (q: string) => {
    setQuestion(q);
    setRibbonOpen(false);
    inputRef.current?.focus();
    ask(q);
  };

  const filteredQuestions = useMemo(() =>
    activeCategory === "All" ? STARTER_QUESTIONS : STARTER_QUESTIONS.filter((q) => q.category === activeCategory),
    [activeCategory]
  );

  const TIME_SCOPES: { label: string; value: typeof timeScope }[] = [
    { label: "1h", value: "1h" },
    { label: "24h", value: "24h" },
    { label: "7d", value: "7d" },
    { label: "all time", value: "all" },
  ];

  return (
    <>
      <ConceptBar />
    <main className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Telemetry Query</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Query fleet telemetry in plain English — each query resolves to a specific MongoDB operation against Atlas.
          </p>
        </div>
      </div>

      {/* Live Atlas facets */}
      {facets && <FacetBar facets={facets} onChip={handleChip} />}

      {/* Input + time scope */}
      <div id="explore-input-area" className="mb-5">
        <div className="flex gap-2 mb-2">
          <input
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && question && ask(question)}
            placeholder="e.g. Show loopback runs where pcie_card_1 failed with LB_TIMEOUT"
            className="flex-1 bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
          <button
            onClick={() => question && ask(question)}
            disabled={!question || loading}
            className="disabled:opacity-40 text-white text-sm font-medium px-6 py-3 rounded-lg transition-colors whitespace-nowrap"
            style={{ background: "#009999" }}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Querying…
              </span>
            ) : "Ask"}
          </button>
        </div>

        {/* Time scope + history */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400 font-medium mr-0.5">SCOPE</span>
            {TIME_SCOPES.map((ts) => (
              <button
                key={ts.value}
                onClick={() => setTimeScope(ts.value)}
                className={`text-[11px] px-2 py-0.5 rounded transition-colors border font-mono ${
                  timeScope === ts.value
                    ? "bg-teal-600 text-white border-teal-600"
                    : "text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {ts.label}
              </button>
            ))}
          </div>
          {history.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[10px] text-slate-400 font-medium shrink-0">RECENT</span>
              {history.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleChip(q)}
                  className="text-[10px] font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 hover:bg-slate-100 transition-colors whitespace-nowrap max-w-[160px] truncate"
                  title={q}
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Starter questions — collapsible ribbon */}
      <div id="starter-questions" className="mb-5">
        <button
          onClick={() => setRibbonOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Sample queries</span>
            <span className="text-[10px] text-slate-400">— each exercises a different MongoDB feature</span>
            <span className="text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded">
              {STARTER_QUESTIONS.length} queries
            </span>
          </div>
          <span className="text-slate-400 text-xs font-mono">{ribbonOpen ? "▾ hide" : "▸ show"}</span>
        </button>

        {ribbonOpen && (
          <div className="mt-2 border border-slate-200 rounded-lg bg-white overflow-hidden">
            {/* Category filter */}
            <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-100 flex-wrap">
              <span className="text-[10px] text-slate-400 font-medium mr-1">Filter:</span>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors font-medium ${
                    activeCategory === cat
                      ? "bg-slate-700 text-white border-slate-700"
                      : "text-slate-500 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100">
              {filteredQuestions.map((sq) => (
                <button
                  key={sq.q}
                  onClick={() => handleChip(sq.q)}
                  className="text-left bg-white hover:bg-slate-50 px-4 py-3 transition-colors group"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wide">{sq.category}</span>
                    <span className="text-slate-300">·</span>
                    <span className="text-[11px] font-medium text-slate-600">{sq.label}</span>
                  </div>
                  <div className="text-xs text-slate-700 group-hover:text-slate-900 mb-1.5 leading-relaxed">{sq.q}</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-mono bg-emerald-50 border border-emerald-200 text-emerald-700 px-1.5 py-0.5 rounded">MDB: {sq.mdb}</span>
                    <span className="text-[10px] font-mono bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5 rounded">SQL: {sq.sql}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary banner */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-slate-800 text-sm leading-relaxed">{result.natural_language_summary}</p>
            <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
              <span className="font-medium text-slate-700">{result.total} result{result.total !== 1 ? "s" : ""}</span>
              <span>·</span>
              <span>{result.duration_ms}ms</span>
              <span>·</span>
              <span>
                collection: <span className="font-mono font-medium text-slate-700">{result.query_info?.collection}</span>
                <span className="text-slate-300 ml-1">(≈ SQL table)</span>
              </span>
              {result.total === 20 && (
                <span className="text-amber-600">· capped at 20 — try a more specific question</span>
              )}
            </div>
          </div>

          {/* Data table */}
          <ResultTable data={result.data} />

          {/* Query explainer */}
          <div id="query-explainer" className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <button
              onClick={() => setShowQuery((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                How MongoDB answered this
                <span className="text-slate-400 text-xs font-normal">pipeline + SQL equivalent</span>
              </span>
              <span className="text-slate-400 text-xs">{showQuery ? "▾ hide" : "▸ show"}</span>
            </button>

            {showQuery && (
              <div className="bg-slate-50 divide-y divide-slate-100">
                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      MongoDB · {result.query_info?.operation}
                    </p>
                    {result.query_info?.query_strategy && (
                      <span className="text-[10px] font-mono bg-emerald-50 border border-emerald-200 text-emerald-700 px-1.5 py-0.5 rounded">
                        {result.query_info.query_strategy}
                      </span>
                    )}
                    <span className="text-[10px] font-mono bg-slate-100 border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                      {result.query_info?.operation === "aggregate" ? "aggregation pipeline" : "find query"}
                    </span>
                  </div>
                  <pre className="bg-white rounded-lg p-4 text-xs overflow-auto leading-relaxed border border-slate-200 font-mono">
                    <JsonLight code={JSON.stringify(
                      result.query_info?.mongodb_pipeline ?? result.query_info?.mongodb_filter ?? {},
                      null, 2
                    )} />
                  </pre>
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">SQL equivalent</p>
                    <span className="text-[10px] font-mono bg-blue-50 border border-blue-200 text-blue-700 px-1.5 py-0.5 rounded">
                      what this would look like in PostgreSQL
                    </span>
                  </div>
                  <pre className="bg-white rounded-lg p-4 text-xs whitespace-pre-wrap leading-relaxed border border-slate-200 font-mono">
                    <SqlLight code={result.query_info?.sql_equivalent ?? ""} />
                  </pre>
                </div>

                {result.query_info?.performance_note && (
                  <div className={`px-4 py-3 flex items-start gap-2 text-xs ${
                    result.query_info.performance_note.includes("$regex") ? "text-amber-700 bg-amber-50" : "text-slate-600"
                  }`}>
                    <span className="mt-0.5">⚡</span>
                    <div>
                      <span className="font-medium">Performance · </span>
                      {result.query_info.performance_note}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!result && <div id="query-explainer" className="hidden" />}
    </main>
    </>
  );
}
