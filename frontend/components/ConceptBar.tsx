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
  };

  return (
    <div className="border-b border-gray-800 bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center justify-between">
        <button onClick={toggle} className="text-xs text-gray-400 hover:text-white transition-colors">
          {visible ? "▾ MongoDB ↔ SQL concepts" : "▸ Show MongoDB ↔ SQL concepts"}
        </button>
        {visible && (
          <div className="flex gap-4 flex-wrap">
            {[
              { collection: "devices", count: counts.devices },
              { collection: "test_runs", count: counts.test_runs },
              { collection: "alerts", count: counts.alerts },
            ].map((c) => (
              <span key={c.collection} className="text-xs text-gray-300 bg-gray-900 px-2 py-1 rounded border border-gray-700">
                <span className="text-green-400 font-mono font-medium">{c.collection}</span>
                {c.count !== undefined && <span className="text-gray-400 ml-1">· {c.count.toLocaleString()} docs</span>}
                <span className="text-gray-400 ml-1">≈ SQL table</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {visible && (
        <div className="max-w-7xl mx-auto px-4 pb-2">
          <div className="flex gap-3 flex-wrap">
            {STATIC_CARDS.map((card) => (
              <div key={card.mongoTerm} className="group relative text-xs bg-gray-900 border border-gray-700 rounded px-2.5 py-1.5 cursor-help">
                <span className="text-yellow-300 font-mono font-medium">{card.mongoTerm}</span>
                <span className="text-gray-400 mx-1">→</span>
                <span className="text-blue-300 font-medium">{card.sqlEquivalent}</span>
                <div className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-50 w-56 bg-gray-800 border border-gray-500 rounded p-2 text-gray-200 shadow-xl text-xs leading-relaxed">
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
