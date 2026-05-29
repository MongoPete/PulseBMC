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
  what: string;      // what it does in plain English
  watch: string;     // what to watch in the UI
  accent: string;    // tailwind color classes
}

const SCENARIOS: Scenario[] = [
  {
    id: "burst",
    label: "Burst Failure — Device 15",
    what: "Injects 5 back-to-back failures on Device 15 right now.",
    watch: "LED 15 turns red → Open Alerts page → alert auto-created.",
    accent: "border-l-2 border-l-rose-700 border-y border-r border-slate-700/60 hover:bg-slate-800/60 text-slate-300",
  },
  {
    id: "trending",
    label: "Trending Failure — Device 7",
    what: "Seeds Device 7 at ~20% failure rate (above the 10% alert threshold) immediately.",
    watch: "LED 7 turns red and a 'high' severity alert fires right away. Contrast with burst's 'critical'.",
    accent: "border-l-2 border-l-amber-700 border-y border-r border-slate-700/60 hover:bg-slate-800/60 text-slate-300",
  },
  {
    id: "offline",
    label: "Simulate Offline Buffer (20 s)",
    what: "Pauses simulator writes for 20 seconds, then auto-flushes them all to Atlas.",
    watch: "Live feed shows 'buffering…' → then 'flushed' with a burst of catch-up writes. Edge-sync resilience.",
    accent: "border-l-2 border-l-sky-700 border-y border-r border-slate-700/60 hover:bg-slate-800/60 text-slate-300",
  },
  {
    id: "reset",
    label: "Reset Fleet to Healthy",
    what: "Clears all injected failures immediately.",
    watch: "Red LEDs return to green. Good for resetting before the next scenario.",
    accent: "border-l-2 border-l-emerald-700 border-y border-r border-slate-700/60 hover:bg-slate-800/60 text-slate-300",
  },
];

const ACTIONS: Record<ScenarioId, () => Promise<unknown>> = {
  burst: () => api.demo.burstFailure("device-015"),
  trending: () => api.demo.trendingFailure("device-007"),
  offline: () => api.demo.offlineBuffer(),
  reset: () => api.demo.reset(),
};

export default function DemoControls({ onAction }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ScenarioId | null>(null);
  const [lastRun, setLastRun] = useState<{ id: ScenarioId; ok: boolean; msg: string } | null>(null);

  const run = async (scenario: Scenario) => {
    setLoading(scenario.id);
    setLastRun(null);
    try {
      await ACTIONS[scenario.id]();
      setLastRun({ id: scenario.id, ok: true, msg: `✓ ${scenario.label} triggered` });
      onAction?.();
    } catch {
      setLastRun({ id: scenario.id, ok: false, msg: "✗ Request failed — check backend is running" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-700/60 overflow-hidden" id="demo-controls">
      {/* Trigger row */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/60 hover:bg-slate-800/60 transition-colors"
      >
        <span className="flex items-center gap-2.5 text-sm">
          <span className="text-slate-400">Demo Scenarios</span>
          <span className="text-xs text-slate-600 bg-slate-800 px-1.5 py-0.5 rounded">browser-controlled</span>
        </span>
        <span className="text-slate-400 text-xs">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="bg-slate-950/60 divide-y divide-slate-800/40">
          {/* Context row */}
          <div className="px-4 py-3">
            <p className="text-xs text-slate-300 leading-relaxed">
              Each scenario writes directly to Atlas — no terminal commands needed.
              The simulator starts automatically with the app, so all four scenarios work out of the box.
              Watch the <em>Live Event Feed</em> on the right to see every change as it happens.
            </p>
          </div>

          {/* Scenario buttons */}
          {SCENARIOS.map((s) => (
            <div key={s.id} className="px-4 py-3">
              <button
                onClick={() => run(s)}
                disabled={!!loading}
                className={`w-full text-left text-xs border rounded-lg px-3 py-2.5 transition-colors mb-2 ${s.accent} disabled:opacity-40`}
              >
                {loading === s.id ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                    Running…
                  </span>
                ) : s.label}
              </button>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                <div>
                  <span className="text-slate-200 font-medium">What it does: </span>
                  {s.what}
                </div>
                <div>
                  <span className="text-slate-200 font-medium">Watch for: </span>
                  {s.watch}
                </div>
              </div>
            </div>
          ))}

          {/* Feedback */}
          {lastRun && (
            <div className={`px-4 py-2.5 text-xs ${lastRun.ok ? "text-emerald-400" : "text-rose-400"}`}>
              {lastRun.msg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
