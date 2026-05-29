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
  const [visible, setVisible] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const stored = localStorage.getItem("conceptbar-visible");
    if (stored === "true") setVisible(true);

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
  };

  return (
    <div className="border-b bg-white" style={{ borderColor: "#e2e8f0" }}>
      <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center justify-between">
        <button
          onClick={toggle}
          className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
        >
          {visible ? "▾ MongoDB ↔ SQL concepts" : "▸ MongoDB ↔ SQL concepts"}
        </button>
        {visible && (
          <div className="flex gap-3 flex-wrap">
            {[
              { collection: "devices", count: counts.devices },
              { collection: "test_runs", count: counts.test_runs },
              { collection: "alerts", count: counts.alerts },
            ].map((c) => (
              <span key={c.collection} className="text-xs text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                <span className="font-mono font-medium" style={{ color: "#009999" }}>{c.collection}</span>
                {c.count !== undefined && <span className="text-slate-400 ml-1">· {c.count.toLocaleString()}</span>}
              </span>
            ))}
          </div>
        )}
      </div>

      {visible && (
        <div className="max-w-7xl mx-auto px-4 pb-2">
          <div className="flex gap-2 flex-wrap">
            {STATIC_CARDS.map((card) => (
              <div
                key={card.mongoTerm}
                className="group relative text-xs bg-slate-50 border border-slate-200 rounded px-2.5 py-1 cursor-help"
              >
                <span className="font-mono font-medium text-slate-700">{card.mongoTerm}</span>
                <span className="text-slate-400 mx-1">→</span>
                <span className="font-medium text-blue-600">{card.sqlEquivalent}</span>
                <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-50 w-56 bg-white border border-slate-200 rounded p-2 text-slate-700 shadow-lg text-xs leading-relaxed">
                  {card.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
