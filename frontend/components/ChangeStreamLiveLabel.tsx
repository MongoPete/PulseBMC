"use client";

import { useState } from "react";
import { PanelAccentBar } from "@/components/ConceptLabels";
import { SIEMENS_PETROL } from "@/lib/theme";

interface Props {
  connected: boolean;
  compact?: boolean;
}

const INFO =
  "Real-time insert/update events from Atlas reach the browser through Server-Sent Events — no polling.";

/** MongoDB Change Stream → SSE — Aaron pitch moment #4. */
export default function ChangeStreamLiveLabel({ connected, compact = false }: Props) {
  const [showInfo, setShowInfo] = useState(false);

  const statusText = connected ? "Change Stream → SSE" : compact ? "Connecting…" : "connecting…";
  const dotClass = connected
    ? compact
      ? "bg-green-500 animate-pulse"
      : "bg-green-400"
    : compact
      ? "bg-slate-300"
      : "bg-slate-400";

  return (
    <span className={`inline-flex flex-col items-start gap-1 ${compact ? "" : "min-w-0"}`}>
      <button
        type="button"
        onClick={() => setShowInfo((o) => !o)}
        aria-expanded={showInfo}
        className={`inline-flex items-center gap-1.5 text-left rounded-md border px-2 py-0.5 transition-colors ${
          showInfo
            ? "border-[#009999] bg-[#009999]/10"
            : "border-transparent hover:border-slate-200 hover:bg-slate-50"
        }`}
        style={showInfo ? { borderColor: SIEMENS_PETROL } : undefined}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
        <span className={compact ? "text-slate-500 text-xs" : "text-[10px] text-slate-600"}>
          {statusText}
        </span>
        <span className="text-[10px] font-mono tabular-nums" style={{ color: SIEMENS_PETROL }}>
          {showInfo ? "▾" : "▸"}
        </span>
      </button>

      {showInfo && (
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
          <PanelAccentBar />
          <p className="px-3 py-2 text-[11px] text-slate-600 leading-relaxed">
            <span className="font-mono font-semibold text-emerald-800">Change Stream</span>
            <span className="text-slate-400 mx-1">≈</span>
            <span className="font-semibold text-blue-800">SQL TRIGGER / LISTEN-NOTIFY</span>
            <span className="text-slate-400 mx-1">·</span>
            {INFO}
          </p>
        </div>
      )}
    </span>
  );
}
