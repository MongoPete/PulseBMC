"use client";
import { useState } from "react";

interface QueryInfo {
  mongodb_pipeline?: unknown[];
  mongodb_filter?: Record<string, unknown>;
  sql_equivalent?: string;
  index_hint?: string;
}

interface Props {
  queryInfo: QueryInfo;
  label?: string;
}

export default function QueryTooltip({ queryInfo, label = "Query" }: Props) {
  const [open, setOpen] = useState(false);

  if (!queryInfo?.sql_equivalent) return null;

  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs text-slate-400 hover:text-slate-700 underline decoration-dotted ml-2 transition-colors"
        title="Show query behind this view"
      >
        {open ? "▾" : "▸"} {label}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-96 bg-white border border-slate-200 rounded-lg p-3 shadow-xl text-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-800 font-semibold">Query behind this view</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
          </div>

          <div className="mb-3">
            <p className="text-slate-600 font-medium mb-1">MongoDB pipeline</p>
            <pre className="bg-slate-50 border border-slate-100 rounded p-2 text-slate-700 overflow-auto max-h-40 text-xs">
              {JSON.stringify(
                queryInfo.mongodb_pipeline ?? queryInfo.mongodb_filter ?? {},
                null,
                2
              )}
            </pre>
          </div>

          <div className="mb-2">
            <p className="text-slate-600 font-medium mb-1">SQL equivalent</p>
            <pre className="bg-slate-50 border border-slate-100 rounded p-2 text-blue-700 text-xs whitespace-pre-wrap">
              {queryInfo.sql_equivalent}
            </pre>
          </div>

          {queryInfo.index_hint && (
            <div className="text-slate-500 border-t border-slate-100 pt-2 mt-2">
              <span style={{ color: "#009999" }}>⚡</span> {queryInfo.index_hint}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
