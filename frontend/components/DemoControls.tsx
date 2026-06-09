"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { subscribeSimState, controlSim } from "@/lib/simState";
import { useSessionMode } from "@/lib/sessionMode";

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
    what: "Injects 5 consecutive loopback failures on Device 15.",
    watch: "Device 15 transitions to fault state → Alerts view auto-creates an entry.",
    accent: "text-slate-700 border-slate-200 hover:bg-slate-50",
    leftBorder: "border-l-slate-400",
  },
  {
    id: "trending",
    label: "Trending Fault — Device 7",
    what: "Seeds Device 7 at ~20% failure rate, above the 10% alert threshold.",
    watch: "Device 7 enters fault state and a high-severity alert is raised.",
    accent: "text-slate-700 border-slate-200 hover:bg-slate-50",
    leftBorder: "border-l-slate-400",
  },
  {
    id: "offline",
    label: "Connectivity Loss (20 s)",
    what: "Suspends telemetry writes for 20 seconds, then auto-flushes to Atlas.",
    watch: "Live feed shows gap → batch of catch-up writes on reconnect.",
    accent: "text-slate-700 border-slate-200 hover:bg-slate-50",
    leftBorder: "border-l-slate-400",
  },
  {
    id: "reset",
    label: "Restore Fleet",
    what: "Clears all injected faults and returns all devices to passing state.",
    watch: "Fault indicators clear across the fleet grid.",
    accent: "text-slate-700 border-slate-200 hover:bg-slate-50",
    leftBorder: "border-l-teal-500",
  },
];

const ACTIONS: Record<ScenarioId, () => Promise<unknown>> = {
  burst: () => api.demo.burstFailure("device-015"),
  trending: () => api.demo.trendingFailure("device-007"),
  offline: () => api.demo.offlineBuffer(),
  reset: () => api.demo.reset(),
};

export default function DemoControls({ onAction }: Props) {
  const sessionMode = useSessionMode();
  const [loading, setLoading] = useState<ScenarioId | null>(null);
  const [lastRun, setLastRun] = useState<{ id: ScenarioId; ok: boolean; msg: string } | null>(null);
  const [simRunning, setSimRunning] = useState<boolean | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    return subscribeSimState(setSimRunning);
  }, []);

  if (sessionMode) return null;

  const toggleSimulator = async () => {
    if (simRunning === null) return;
    setSimLoading(true);
    try {
      await controlSim(simRunning ? "stop" : "start");
      onAction?.();
    } catch { /* ignore */ } finally {
      setSimLoading(false);
    }
  };

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
    <div id="scenario-controls" className="pt-3">
      {/* Simulator status + pause/resume */}
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2 text-xs">
          <span className={`w-2 h-2 rounded-full ${
            simRunning === null ? "bg-slate-300" :
            simRunning ? "bg-green-500 animate-pulse" : "bg-slate-300"
          }`} />
          <span className="text-slate-500">
            Simulator:{" "}
            <span className={simRunning ? "text-green-600 font-medium" : "text-slate-400"}>
              {simRunning === null ? "…" : simRunning ? "running" : "paused"}
            </span>
          </span>
        </div>
        <button
          onClick={toggleSimulator}
          disabled={simLoading || simRunning === null}
          className={`text-xs px-3 py-1.5 rounded border font-medium transition-colors disabled:opacity-40 ${
            simRunning
              ? "border-amber-300 text-amber-700 hover:bg-amber-50"
              : "border-green-300 text-green-700 hover:bg-green-50"
          }`}
        >
          {simLoading ? (
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 border border-current border-t-transparent rounded-full animate-spin" />
              {simRunning ? "Pausing…" : "Resuming…"}
            </span>
          ) : simRunning ? "Pause Simulator" : "Resume Simulator"}
        </button>
      </div>

      <p className="text-xs text-slate-500 mb-3">
        Each scenario writes directly to Atlas — observe how SoCPulse detects and surfaces faults in real time.
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
