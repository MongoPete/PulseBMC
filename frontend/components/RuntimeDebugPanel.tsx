"use client";

import { useEffect, useMemo, useState } from "react";
import { subscribeRuntimeCounts } from "@/lib/runtimeDebug";

type RuntimeCounts = {
  eventSources: number;
  timers: number;
};

export default function RuntimeDebugPanel({
  title = "Runtime",
  metrics = {},
}: {
  title?: string;
  metrics?: Record<string, string | number>;
}) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<RuntimeCounts>({ eventSources: 0, timers: 0 });

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const urlFlag = sp.get("debugRuntime") === "1";
    const localFlag = window.localStorage.getItem("debug-runtime") === "1";
    setEnabled(urlFlag || localFlag);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    return subscribeRuntimeCounts((next) => setCounts(next));
  }, [enabled]);

  const entries = useMemo(
    () => [
      ["eventSources", counts.eventSources],
      ["timers", counts.timers],
      ...Object.entries(metrics),
    ],
    [counts, metrics]
  );

  if (!enabled) return null;

  return (
    <div className="fixed right-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:bottom-3 z-50">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-[10px] font-mono px-2 py-1 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
        >
          debug
        </button>
      ) : (
        <div className="w-56 rounded border border-slate-300 bg-white shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-200 bg-slate-50">
            <span className="text-[10px] font-semibold text-slate-600">{title}</span>
            <button onClick={() => setOpen(false)} className="text-[10px] text-slate-400 hover:text-slate-600">
              ✕
            </button>
          </div>
          <div className="px-2.5 py-2 space-y-1">
            {entries.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-slate-400">{k}</span>
                <span className="text-slate-700">{String(v)}</span>
              </div>
            ))}
          </div>
          <div className="px-2.5 py-1.5 border-t border-slate-200 text-[9px] text-slate-400">
            enable via `?debugRuntime=1` or localStorage `debug-runtime=1`
          </div>
        </div>
      )}
    </div>
  );
}
