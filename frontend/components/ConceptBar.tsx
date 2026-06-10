"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ConceptCard {
  mongoTerm: string;
  sqlEquivalent: string;
  detail: string;
}

const STATIC_CARDS: ConceptCard[] = [
  { mongoTerm: "Collection", sqlEquivalent: "Table", detail: "Schema-flexible: documents can vary in shape" },
  { mongoTerm: "Document", sqlEquivalent: "Row", detail: "JSON structure — fields can be nested or arrays" },
  { mongoTerm: "Embedded array", sqlEquivalent: "Child table + JOIN", detail: "components[] lives inside test_runs — no JOIN needed" },
  { mongoTerm: "$match", sqlEquivalent: "WHERE", detail: "First stage of an aggregation pipeline" },
  { mongoTerm: "$group", sqlEquivalent: "GROUP BY", detail: "Aggregation stage for rollups" },
  { mongoTerm: "Change Stream", sqlEquivalent: "Trigger / LISTEN-NOTIFY", detail: "Real-time events on insert/update — powers SSE" },
];

export default function ConceptBar() {
  const [visible, setVisible] = useState(true);
  const [activeDetail, setActiveDetail] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const stored = localStorage.getItem("conceptbar-visible");
    if (stored === "false") setVisible(false);

    Promise.allSettled([
      api.devices(),
      api.testRuns(undefined, 1),
      api.alerts("open"),
    ]).then(([devRes, runRes, alertRes]) => {
      const c: Record<string, number> = {};
      if (devRes.status === "fulfilled") c.devices = devRes.value.total ?? 0;
      if (runRes.status === "fulfilled") c.test_runs = runRes.value.total ?? 0;
      if (alertRes.status === "fulfilled") c.alerts = alertRes.value.total ?? 0;
      setCounts(c);
    });
  }, []);

  const toggle = () => {
    const next = !visible;
    setVisible(next);
    localStorage.setItem("conceptbar-visible", String(next));
    if (!next) setActiveDetail(null);
  };

  const toggleDetail = (mongoTerm: string) => {
    setActiveDetail((prev) => (prev === mongoTerm ? null : mongoTerm));
  };

  return (
    <div className="border-b bg-white w-full min-w-0" style={{ borderColor: "#e2e8f0" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={toggle}
          className="text-xs text-slate-400 hover:text-slate-700 transition-colors shrink-0 min-h-[36px] text-left"
        >
          {visible ? "▾ MongoDB ↔ SQL concepts" : "▸ MongoDB ↔ SQL concepts"}
        </button>
        {visible && (
          <div className="flex gap-2 overflow-x-auto scrollbar-thin min-w-0 -mx-1 px-1">
            {[
              { collection: "devices", count: counts.devices },
              { collection: "test_runs", count: counts.test_runs },
              { collection: "alerts", count: counts.alerts },
            ].map((c) => (
              <span
                key={c.collection}
                className="text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200 whitespace-nowrap shrink-0"
              >
                <span className="font-mono font-medium" style={{ color: "#009999" }}>
                  {c.collection}
                </span>
                {c.count !== undefined && (
                  <span className="text-slate-400 ml-1">· {c.count.toLocaleString()}</span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      {visible && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-2 min-w-0">
          <div className="flex gap-2 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-thin md:flex-wrap md:overflow-visible md:snap-none -mx-1 px-1">
            {STATIC_CARDS.map((card) => (
              <button
                key={card.mongoTerm}
                type="button"
                onClick={() => toggleDetail(card.mongoTerm)}
                className={`group relative text-xs bg-slate-50 border rounded px-2.5 py-1.5 shrink-0 snap-start text-left transition-colors min-h-[36px] md:cursor-help max-w-[85vw] sm:max-w-none ${
                  activeDetail === card.mongoTerm
                    ? "border-teal-400 bg-teal-50/50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span className="font-mono font-medium text-slate-700">{card.mongoTerm}</span>
                <span className="text-slate-400 mx-1">→</span>
                <span className="font-medium text-blue-600">{card.sqlEquivalent}</span>
                <div className="absolute bottom-full left-0 mb-1 hidden md:group-hover:block z-50 w-56 bg-white border border-slate-200 rounded p-2 text-slate-700 shadow-lg text-xs leading-relaxed pointer-events-none">
                  {card.detail}
                </div>
              </button>
            ))}
          </div>
          {activeDetail && (
            <p className="md:hidden text-xs text-slate-600 mt-1.5 leading-relaxed break-words">
              {STATIC_CARDS.find((c) => c.mongoTerm === activeDetail)?.detail}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
