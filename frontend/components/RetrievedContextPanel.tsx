"use client";
import { useState } from "react";

interface RetrievedDoc {
  collection: string;
  doc_id: string;
  similarity?: number;
  summary: string;
}

interface Props {
  docs: RetrievedDoc[];
  agentRunId?: string;
}

export default function RetrievedContextPanel({ docs, agentRunId }: Props) {
  const [open, setOpen] = useState(false);

  if (!docs || docs.length === 0) return null;

  const topScore = Math.max(...docs.map((d) => d.similarity ?? 0));

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <span className="flex items-center gap-3">
          <span
            className="flex items-center justify-center w-6 h-6 rounded-md text-xs font-bold shrink-0"
            style={{ background: "#e6f7f7", color: "#009999" }}
          >
            ⟳
          </span>
          <span className="text-sm text-slate-700">
            Vector Search · {docs.length} similar past failure{docs.length !== 1 ? "s" : ""} retrieved
          </span>
          <span className="text-xs text-slate-400 font-mono bg-slate-100 px-1.5 py-0.5 rounded">
            {(topScore * 100).toFixed(0)}% top match
          </span>
        </span>
        <span className="text-slate-400 text-xs">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
          <p className="text-xs text-slate-500 leading-relaxed">
            Semantically similar past failures retrieved via{" "}
            <span className="font-mono text-slate-700">$vectorSearch</span> using 1024-dim Atlas vector embeddings.
            Matches on meaning, not just error codes.
          </p>

          <div className="space-y-2">
            {docs.map((doc, i) => {
              const pct = Math.round((doc.similarity ?? 0) * 100);
              return (
                <div key={i} className="flex items-start gap-3 bg-white rounded-lg p-3 border border-slate-200">
                  <div className="flex flex-col items-center gap-1 shrink-0 w-10 pt-0.5">
                    <div className="h-8 w-1.5 bg-slate-100 rounded-full overflow-hidden flex flex-col justify-end">
                      <div
                        className="w-full rounded-full transition-all"
                        style={{ height: `${pct}%`, background: "#009999" }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 font-mono">{pct}%</span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-slate-500">{doc.collection}</span>
                      <span className="text-slate-300">·</span>
                      <span className="text-xs text-slate-400 font-mono">…{doc.doc_id.slice(-8)}</span>
                    </div>
                    {doc.summary && (
                      <p className="text-sm text-slate-700 leading-relaxed">{doc.summary}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {agentRunId && (
            <p className="text-xs text-slate-400 pt-1">
              Agent run <span className="font-mono">{agentRunId.slice(-8)}</span>
              {" "}· trace stored in <span className="font-mono text-slate-600">agent_runs</span> collection
            </p>
          )}
        </div>
      )}
    </div>
  );
}
