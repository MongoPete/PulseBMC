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
        className="text-xs text-gray-300 hover:text-blue-300 underline decoration-dotted ml-2 transition-colors"
        title="Show query behind this view"
      >
        {open ? "▾" : "▸"} {label}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-96 bg-gray-900 border border-gray-500 rounded-lg p-3 shadow-2xl text-xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-white font-semibold">Query behind this view</span>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-white">✕</button>
          </div>

          <div className="mb-3">
            <p className="text-gray-300 font-medium mb-1">MongoDB pipeline</p>
            <pre className="bg-gray-800 rounded p-2 text-green-300 overflow-auto max-h-40 text-xs">
              {JSON.stringify(
                queryInfo.mongodb_pipeline ?? queryInfo.mongodb_filter ?? {},
                null,
                2
              )}
            </pre>
          </div>

          <div className="mb-2">
            <p className="text-gray-300 font-medium mb-1">SQL equivalent</p>
            <pre className="bg-gray-800 rounded p-2 text-blue-300 text-xs whitespace-pre-wrap">
              {queryInfo.sql_equivalent}
            </pre>
          </div>

          {queryInfo.index_hint && (
            <div className="text-gray-300 border-t border-gray-700 pt-2 mt-2">
              <span className="text-yellow-400">⚡</span> {queryInfo.index_hint}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
