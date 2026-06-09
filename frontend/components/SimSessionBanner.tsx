"use client";

import { useEffect, useState } from "react";
import {
  getSimSessionState,
  startSimSession,
  stopSimSession,
  subscribeSimSession,
  type SimSessionState,
} from "@/lib/simSession";
import { SIEMENS_PETROL } from "@/lib/theme";

function formatElapsed(startedAt: number | null): string {
  if (!startedAt) return "0:00";
  const sec = Math.floor((Date.now() - startedAt) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface Props {
  compact?: boolean;
}

export default function SimSessionBanner({ compact = false }: Props) {
  const [session, setSession] = useState<SimSessionState>(() => getSimSessionState());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [, tick] = useState(0);

  useEffect(() => subscribeSimSession(setSession), []);

  useEffect(() => {
    if (session.phase !== "active") return;
    const i = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(i);
  }, [session.phase]);

  const onStart = async () => {
    setBusy(true);
    setError("");
    try {
      await startSimSession();
    } catch {
      setError("Could not start live demo — check backend connection.");
    } finally {
      setBusy(false);
    }
  };

  const onStop = async () => {
    setBusy(true);
    setError("");
    try {
      await stopSimSession("manual");
    } finally {
      setBusy(false);
    }
  };

  if (compact) {
    const active = session.phase === "active";
    return (
      <div className="flex items-center gap-2 text-xs mb-4">
        <span
          className={`w-2 h-2 rounded-full ${active ? "bg-green-500 animate-pulse" : "bg-slate-300"}`}
        />
        <span className="text-slate-600">
          Live demo: {active ? `running (${formatElapsed(session.startedAt)})` : "off"}
        </span>
        {active ? (
          <button
            type="button"
            onClick={onStop}
            disabled={busy}
            className="text-amber-700 border border-amber-300 rounded px-2 py-0.5 hover:bg-amber-50 disabled:opacity-50"
          >
            End
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            disabled={busy}
            className="text-green-700 border border-green-300 rounded px-2 py-0.5 hover:bg-green-50 disabled:opacity-50"
          >
            Start
          </button>
        )}
      </div>
    );
  }

  const active = session.phase === "active";

  return (
    <div
      className="mb-4 rounded-xl border overflow-hidden"
      style={{
        borderColor: active ? `${SIEMENS_PETROL}55` : "#e2e8f0",
        background: active ? `${SIEMENS_PETROL}08` : "#ffffff",
      }}
    >
      <div className="px-4 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                active ? "bg-green-500 animate-pulse" : "bg-slate-300"
              }`}
            />
            <h2 className="text-sm font-bold text-slate-800">
              {active ? "Live demo running" : "Live demo paused"}
            </h2>
            {active && (
              <span className="text-xs font-mono text-slate-500">{formatElapsed(session.startedAt)}</span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            {active
              ? "Loopback telemetry streams to Atlas while this tab is active on Fleet or Alerts. Stops when you switch tabs, go idle, or leave those pages."
              : "Start a session to stream loopback test telemetry for this kiosk visit only. Nothing runs until you click Start."}
          </p>
        </div>
        <div className="shrink-0">
          {active ? (
            <button
              type="button"
              onClick={onStop}
              disabled={busy}
              className="text-sm font-semibold px-4 py-2 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50 disabled:opacity-50"
            >
              {busy ? "Stopping…" : "End live demo"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onStart}
              disabled={busy}
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50"
              style={{ background: SIEMENS_PETROL }}
            >
              {busy ? "Starting…" : "Start live demo"}
            </button>
          )}
        </div>
      </div>
      {error && (
        <p className="px-4 pb-3 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
