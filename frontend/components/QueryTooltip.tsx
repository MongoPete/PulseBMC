"use client";
import { useEffect, useState } from "react";
import { MongoLabel, PanelAccentBar, SqlLabel } from "@/components/ConceptLabels";
import { SIEMENS_PETROL } from "@/lib/theme";

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

export default function QueryTooltip({ queryInfo, label = "Query behind this view" }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!queryInfo?.sql_equivalent) return null;

  const mongoBody = queryInfo.mongodb_pipeline ?? queryInfo.mongodb_filter ?? {};

  return (
    <div className={`${open ? "block w-full" : "inline-block"} align-middle`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-md border px-2.5 py-1 transition-colors min-h-[30px] ${
          open
            ? "text-[#005159] bg-[#009999]/10"
            : "text-slate-600 bg-white hover:bg-slate-50"
        }`}
        style={{ borderColor: open ? SIEMENS_PETROL : "#e2e8f0" }}
      >
        <span className="font-mono text-[10px] tabular-nums" style={{ color: SIEMENS_PETROL }}>
          {open ? "▾" : "▸"}
        </span>
        {label}
      </button>

      {open && (
        <div className="mt-2 w-full max-w-xl rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <PanelAccentBar />
          <div className="px-3 py-3 sm:px-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-slate-800">{label}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close query panel"
                className="text-slate-400 hover:text-slate-700 text-sm leading-none px-1"
              >
                ×
              </button>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <MongoLabel />
                <span className="text-[11px] text-slate-500">pipeline / filter</span>
              </div>
              <pre className="bg-slate-50 border border-slate-200 rounded-md p-2.5 text-slate-700 overflow-x-auto max-h-40 text-[11px] font-mono leading-relaxed">
                {JSON.stringify(mongoBody, null, 2)}
              </pre>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <SqlLabel />
                <span className="text-[11px] text-slate-500">equivalent</span>
              </div>
              <pre className="bg-blue-50/50 border border-blue-100 rounded-md p-2.5 text-blue-900 text-[11px] font-mono whitespace-pre-wrap leading-relaxed">
                {queryInfo.sql_equivalent}
              </pre>
            </div>

            {queryInfo.index_hint && (
              <p className="text-[11px] text-slate-600 border-t border-slate-100 pt-2 leading-relaxed">
                <span className="font-semibold" style={{ color: SIEMENS_PETROL }}>
                  Index
                </span>
                <span className="text-slate-400 mx-1">·</span>
                {queryInfo.index_hint}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
