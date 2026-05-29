"use client";
import { useState } from "react";
import GuidedTour, { TourCard, WhyBox, Pill } from "@/components/GuidedTour";
import { api } from "@/lib/api";
import type { Step } from "react-joyride";

const STARTER_QUESTIONS = [
  "Which device has the highest failure rate this week?",
  "What error codes appeared most in the last 24 hours?",
  "Show me all failures on pcie_card_1 across the fleet",
  "How many loopback tests ran yesterday?",
  "Which devices have had more than 5 failures today?",
];

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
    index_hint?: string;
  };
}

const EXPLORER_TOUR_STEPS: Step[] = [
  {
    target: "#explore-input-area",
    title: "Ask your fleet anything",
    content: (
      <TourCard>
        <p>
          Type any question about your fleet data in plain English. An LLM translates your
          question into a MongoDB query, runs it against Atlas, and returns structured results.
        </p>
        <p>
          Start with one of the pre-built questions below, or type your own.
          Try: <em>"Which device has the highest failure rate?"</em>
        </p>
        <p className="text-gray-300 text-xs">
          The LLM only generates the query — Atlas executes it. Your data never leaves your cluster.
        </p>
      </TourCard>
    ),
  },
  {
    target: "#starter-questions",
    title: "Pre-built starter questions",
    content: (
      <TourCard>
        <p>
          Click any of these to run a live query against your Atlas cluster right now.
          Each one exercises a different MongoDB feature:
        </p>
        <p>
          <strong>"Highest failure rate"</strong> → <Pill>$group</Pill> aggregation with <Pill>$sort</Pill>
        </p>
        <p>
          <strong>"Error codes in last 24h"</strong> → <Pill>$unwind</Pill> + <Pill>$match</Pill> on a date range
        </p>
        <p>
          <strong>"Failures on pcie_card_1"</strong> → <Pill>$elemMatch</Pill> on the nested components array
        </p>
        <WhyBox>
          All three would require JOINs and subqueries in SQL. In MongoDB, nested data
          is queried directly — no JOINs needed.
        </WhyBox>
      </TourCard>
    ),
  },
  {
    target: "#query-explainer",
    title: "See exactly how MongoDB answered",
    content: (
      <TourCard>
        <p>
          Expand this panel after any query to see:
        </p>
        <p>
          <strong>MongoDB query</strong> — the actual pipeline or filter that ran against Atlas,
          with stage-by-stage structure.
        </p>
        <p>
          <strong>SQL equivalent</strong> — what the same query would look like in SQL,
          so you can map concepts you already know to MongoDB syntax.
        </p>
        <p className="text-gray-300 text-xs">
          The index hint shows which Atlas index was used — confirming the query is efficient.
        </p>
        <WhyBox>
          MongoDB's aggregation pipeline is composable — each stage passes its output to the next.
          It's more expressive than SQL for nested and time-series data.
        </WhyBox>
      </TourCard>
    ),
  },
];

function ResultTable({ data }: { data: Record<string, unknown>[] }) {
  if (!data || data.length === 0) return (
    <div className="rounded-lg border border-slate-200 bg-white px-6 py-10 text-center">
      <p className="text-slate-500 text-sm">No matching documents found in Atlas.</p>
    </div>
  );

  const keys = Object.keys(data[0]).filter((k) => k !== "embedding");

  return (
    <div className="overflow-auto rounded-lg border border-slate-200">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50">
            {keys.map((k) => (
              <th key={k} className="text-left px-4 py-2.5 text-slate-600 font-mono font-semibold whitespace-nowrap border-b border-slate-200 tracking-wide">
                {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.slice(0, 20).map((row, i) => (
            <tr key={i} className={`hover:bg-slate-50 transition-colors ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
              {keys.map((k) => {
                const val = row[k];
                const display = typeof val === "object" ? JSON.stringify(val) : String(val ?? "—");
                const isNum = typeof val === "number";
                const isFail = typeof val === "string" && val === "fail";
                const isPass = typeof val === "string" && val === "pass";
                return (
                  <td key={k} className={`px-4 py-2 whitespace-nowrap max-w-xs truncate font-mono ${
                    isFail ? "text-red-600 font-semibold" :
                    isPass ? "text-green-600" :
                    isNum ? "text-amber-700" :
                    "text-slate-700"
                  }`} title={display}>
                    {display}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ExplorePage() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ExploreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showQuery, setShowQuery] = useState(false);

  const ask = async (q: string) => {
    setQuestion(q);
    setLoading(true);
    setResult(null);
    setShowQuery(false);
    try {
      const res = await api.explore(q) as ExploreResult;
      setResult(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Fleet Explorer</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ask anything about your fleet in plain English.
          </p>
        </div>
        <GuidedTour
          steps={EXPLORER_TOUR_STEPS}
          label="Explorer Tour"
          stepCount={EXPLORER_TOUR_STEPS.length}
        />
      </div>

      {/* Input */}
      <div id="explore-input-area" className="flex gap-2 mb-4">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && question && ask(question)}
          placeholder="e.g. Which device has the highest failure rate this week?"
          className="flex-1 bg-white border border-slate-300 rounded-lg px-4 py-3 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2"
          style={{ focusRingColor: "#009999" } as React.CSSProperties}
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

      {/* Starter questions */}
      <div id="starter-questions" className="flex flex-wrap gap-2 mb-8">
        <span className="text-xs text-slate-400 self-center mr-1">Try:</span>
        {STARTER_QUESTIONS.map((q) => (
          <button
            key={q}
            onClick={() => ask(q)}
            className="text-xs border border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-800 px-3 py-1.5 rounded-full transition-colors"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Summary banner */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 flex items-start gap-4">
            <span className="text-lg mt-0.5 shrink-0" style={{ color: "#009999" }}>◈</span>
            <div className="flex-1 min-w-0">
              <p className="text-slate-800 text-sm leading-relaxed">{result.natural_language_summary}</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
                <span className="font-medium text-slate-700">{result.total} result{result.total !== 1 ? "s" : ""}</span>
                <span>·</span>
                <span>{result.duration_ms}ms</span>
                <span>·</span>
                <span>collection: <span className="font-mono font-medium text-slate-700">{result.query_info?.collection}</span></span>
              </div>
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
                <span style={{ color: "#009999" }}>◈</span>
                How MongoDB answered this
                <span className="text-slate-400 text-xs font-normal">+ SQL equivalent</span>
              </span>
              <span className="text-slate-400 text-xs">{showQuery ? "▾ hide" : "▸ show"}</span>
            </button>

            {showQuery && (
              <div className="bg-slate-50 divide-y divide-slate-100">
                <div className="p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    MongoDB · {result.query_info?.operation}
                  </p>
                  <pre className="bg-white rounded-lg p-4 text-slate-700 text-xs overflow-auto leading-relaxed border border-slate-200">
                    {JSON.stringify(
                      result.query_info?.mongodb_pipeline ?? result.query_info?.mongodb_filter ?? {},
                      null, 2
                    )}
                  </pre>
                </div>

                <div className="p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">SQL equivalent</p>
                  <pre className="bg-white rounded-lg p-4 text-blue-700 text-xs whitespace-pre-wrap leading-relaxed border border-slate-200">
                    {result.query_info?.sql_equivalent}
                  </pre>
                </div>

                {result.query_info?.index_hint && (
                  <div className="px-4 py-3 flex items-center gap-2 text-xs text-slate-600">
                    <span style={{ color: "#009999" }}>⚡</span>
                    <span>{result.query_info.index_hint}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!result && <div id="query-explainer" className="hidden" />}
    </main>
  );
}
