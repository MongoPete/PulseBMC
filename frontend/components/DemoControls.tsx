"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
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

type FailurePresetId = "fm_intermittent" | "fm_sticky" | "fm_silent" | "fm_clear";

interface FailurePreset {
  id: FailurePresetId;
  label: string;
  what: string;
  watch: string;
  deviceId?: string;
  mode?: string;
  accent: string;
  leftBorder: string;
}

const FAILURE_PRESETS: FailurePreset[] = [
  {
    id: "fm_intermittent",
    label: "Intermittent — Device 3",
    what: "Simulator uses clustered rare failures (temporal pattern) on the next cycles.",
    watch: "Device 3 LED flickers fail/pass; run history shows intermittent pattern.",
    deviceId: "device-003",
    mode: "intermittent",
    accent: "text-slate-700 border-slate-200 hover:bg-slate-50",
    leftBorder: "border-l-amber-400",
  },
  {
    id: "fm_sticky",
    label: "Sticky hardware — Device 8",
    what: "First real fail latches red until operator reset or Restore Fleet.",
    watch: "Device 8 stays red after first failure; legend “sticky mode (sim)”.",
    deviceId: "device-008",
    mode: "sticky",
    accent: "text-slate-700 border-slate-200 hover:bg-slate-50",
    leftBorder: "border-l-red-400",
  },
  {
    id: "fm_silent",
    label: "Silent / CRC — Device 12",
    what: "Loopback may still pass while component corruption flags appear in the document.",
    watch: "Device 12 may stay green LED; open device drawer → corruption / silent markers.",
    deviceId: "device-012",
    mode: "silent",
    accent: "text-slate-700 border-slate-200 hover:bg-slate-50",
    leftBorder: "border-l-violet-400",
  },
  {
    id: "fm_clear",
    label: "Clear failure-mode overrides",
    what: "Removes API overrides for devices 3, 8, 12 (simulator falls back to config.json).",
    watch: "Behavior returns to seeded baseline; sticky latch cleared via reset queue.",
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

type LoadingKey = ScenarioId | FailurePresetId | null;

export default function DemoControls({ onAction }: Props) {
  const sessionMode = useSessionMode();
  const [loading, setLoading] = useState<LoadingKey>(null);
  const [lastRun, setLastRun] = useState<{ key: string; ok: boolean; msg: string } | null>(null);
  const [simRunning, setSimRunning] = useState<boolean | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  useEffect(() => {
    return subscribeSimState(setSimRunning);
  }, []);

  if (sessionMode) return null;

  const busy = loading !== null || simLoading;

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
      setLastRun({ key: scenario.id, ok: true, msg: `${scenario.label} triggered` });
      onAction?.();
    } catch {
      setLastRun({ key: scenario.id, ok: false, msg: "Request failed — check backend is running" });
    } finally {
      setLoading(null);
    }
  };

  const runFailurePreset = async (p: FailurePreset) => {
    setLoading(p.id);
    setLastRun(null);
    try {
      if (p.id === "fm_clear") {
        await Promise.all([
          api.demo.setFailureMode("device-003", "none"),
          api.demo.setFailureMode("device-008", "none"),
          api.demo.setFailureMode("device-012", "none"),
        ]);
      } else if (p.deviceId && p.mode) {
        await api.demo.setFailureMode(p.deviceId, p.mode);
      }
      setLastRun({ key: p.id, ok: true, msg: `${p.label} applied` });
      onAction?.();
    } catch {
      setLastRun({ key: p.id, ok: false, msg: "Request failed — check backend is running" });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div id="scenario-controls" className="pt-3">
      <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">
        <span className="text-slate-600 font-medium">MongoDB</span>{" "}
        <code className="text-[10px] bg-slate-100 px-1 rounded">test_runs</code> collection{" "}
        <span className="text-slate-400">(like a SQL table)</span>
        {" — "}each simulator cycle and each button below adds documents{" "}
        <span className="text-slate-400">(like INSERT rows)</span>.{" "}
        <span className="block mt-1 text-slate-400">
          This panel is hidden during a guided live-demo session (session mode).
        </span>
      </p>

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
          type="button"
          onClick={toggleSimulator}
          disabled={simLoading || simRunning === null || busy}
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

      <p className="text-xs font-medium text-slate-700 mb-1">Atlas injection scenarios</p>
      <p className="text-xs text-slate-500 mb-3">
        Immediate writes to Atlas — faults surface on the fleet grid and in alerts.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {SCENARIOS.map((s) => (
          <button
            type="button"
            key={s.id}
            onClick={() => run(s)}
            disabled={busy}
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
                <div className="text-slate-400 font-normal mt-1 text-[10px] leading-snug">
                  <span className="text-slate-500">Watch:</span> {s.watch}
                </div>
              </>
            )}
          </button>
        ))}
      </div>

      <p className="text-xs font-medium text-slate-700 mt-5 mb-1">Failure behavior (simulator)</p>
      <p className="text-[11px] text-slate-500 mb-2 leading-relaxed">
        Tells the loopback simulator how to shape the next{" "}
        <code className="text-[10px] bg-slate-100 px-1 rounded">test_runs</code> documents{" "}
        <span className="text-slate-400">(like row payloads)</span>. Requires simulator{" "}
        <span className="text-slate-600">running</span>.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {FAILURE_PRESETS.map((p) => (
          <button
            type="button"
            key={p.id}
            onClick={() => runFailurePreset(p)}
            disabled={busy}
            className={`text-left text-xs border rounded-lg px-3 py-2.5 transition-colors border-l-4 ${p.leftBorder} ${p.accent} disabled:opacity-40`}
          >
            {loading === p.id ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                Applying…
              </span>
            ) : (
              <>
                <div className="font-semibold mb-0.5">{p.label}</div>
                <div className="text-slate-500 font-normal">{p.what}</div>
                <div className="text-slate-400 font-normal mt-1 text-[10px] leading-snug">
                  <span className="text-slate-500">Watch:</span> {p.watch}
                </div>
              </>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:flex-wrap gap-2 text-[11px]">
        <span className="text-slate-500 shrink-0">Continue the script:</span>
        <Link
          href="/alerts"
          className="text-slate-700 underline decoration-slate-300 hover:decoration-slate-600 font-medium"
        >
          Alerts — AI chain ($match ≈ WHERE, $lookup ≈ LEFT JOIN)
        </Link>
        <span className="text-slate-300 hidden sm:inline">·</span>
        <Link
          href="/explore"
          className="text-slate-700 underline decoration-slate-300 hover:decoration-slate-600 font-medium"
        >
          Explore — natural language → aggregation pipeline
        </Link>
      </div>

      {lastRun && (
        <div className={`mt-3 text-xs px-3 py-2 rounded-lg border ${lastRun.ok ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"}`}>
          {lastRun.ok ? "✓" : "✗"} {lastRun.msg}
        </div>
      )}
    </div>
  );
}
