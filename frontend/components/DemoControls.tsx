"use client";
import { useState } from "react";
import { api } from "@/lib/api";

interface Props {
  onAction?: () => void;
}

type ScenarioId = "burst" | "trending" | "offline" | "reset";

interface Scenario {
  id: ScenarioId;
  label: string;
  what: string;
  watch: string;
  accent: string;
  leftBorder: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "burst",
    label: "Burst Failure — Device 15",
    what: "Injects 5 back-to-back failures on Device 15 right now.",
    watch: "Device 15 turns red → open Alerts page → alert auto-created.",
    accent: "text-red-700 border-slate-200 hover:bg-red-50",
    leftBorder: "border-l-red-400",
  },
  {
    id: "trending",
    label: "Trending Failure — Device 7",
    what: "Seeds Device 7 at ~20% failure rate, above the 10% alert threshold.",
    watch: "Device 7 turns red and a 'high' severity alert fires right away.",
    accent: "text-amber-700 border-slate-200 hover:bg-amber-50",
    leftBorder: "border-l-amber-400",
  },
  {
    id: "offline",
    label: "Offline Buffer (20 s)",
    what: "Pauses simulator writes for 20 seconds, then auto-flushes to Atlas.",
    watch: "Feed shows 'buffering…' → then burst of catch-up writes.",
    accent: "text-blue-700 border-slate-200 hover:bg-blue-50",
    leftBorder: "border-l-blue-400",
  },
  {
    id: "reset",
    label: "Reset Fleet to Healthy",
    what: "Clears all injected failures immediately.",
    watch: "Red devices return to green.",
    accent: "text-green-700 border-slate-200 hover:bg-green-50",
    leftBorder: "border-l-green-400",
  },
];

const ACTIONS: Record<ScenarioId, () => Promise<unknown>> = {
  burst: () => api.demo.burstFailure("device-015"),
  trending: () => api.demo.trendingFailure("device-007"),
  offline: () => api.demo.offlineBuffer(),
  reset: () => api.demo.reset(),
};

export default function DemoControls({ onAction }: Props) {
  const [loading, setLoading] = useState<ScenarioId | null>(null);
  const [lastRun, setLastRun] = useState<{ id: ScenarioId; ok: boolean; msg: string } | null>(null);

  const run = async (scenario: Scenario) => {
    setLoading(scenario.id);
    setLastRun(null);
    try {
      await ACTIONS[scenario.id]();
      setLastRun({ id: scenario.id, ok: true, msg: `${scenario.label} triggered` });
      onAction?.();
    } catch {
      setLastRun({ id: scenario.id, ok: false, msg: "Request failed — check backend is running" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div id="demo-controls" className="pt-3">
      <p className="text-xs text-slate-500 mb-3">
        Each scenario writes directly to Atlas — no terminal commands needed.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            onClick={() => run(s)}
            disabled={!!loading}
            className={`text-left text-xs border rounded-lg px-3 py-2.5 transition-colors border-l-4 ${s.leftBorder} ${s.accent} disabled:opacity-40`}
          >
            {loading === s.id ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                Running…
              </span>
            ) : (
              <>
                <div className="font-semibold mb-0.5">{s.label}</div>
                <div className="text-slate-500 font-normal">{s.what}</div>
              </>
            )}
          </button>
        ))}
      </div>

      {lastRun && (
        <div className={`mt-3 text-xs px-3 py-2 rounded-lg border ${lastRun.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {lastRun.ok ? "✓" : "✗"} {lastRun.msg}
        </div>
      )}
    </div>
  );
}
