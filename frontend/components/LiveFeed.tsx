"use client";
import { useEffect, useRef, useState } from "react";
import { SSE_URL, api } from "@/lib/api";

interface FeedEvent {
  id: number;
  ts: string;
  event_type: "test_run" | "alert" | "demo" | string;
  device_id: string;
  led_state: string;
  status: string;
  message: string;
}

const MAX_EVENTS = 60;

function eventLabel(ev: FeedEvent): { text: string; color: string } {
  if (ev.event_type === "alert") {
    return { text: ev.message || `Alert fired on ${ev.device_id}`, color: "text-rose-400" };
  }
  if (ev.event_type === "demo") {
    return { text: ev.message || `Demo action on ${ev.device_id}`, color: "text-amber-400" };
  }
  // Normal test_run
  const state = ev.led_state === "green" ? "pass" : ev.led_state === "red" ? "FAIL" : ev.led_state;
  const color = ev.led_state === "red" ? "text-rose-300" : "text-emerald-400";
  return { text: `${ev.device_id}  ${state}`, color };
}

function EventTypeTag({ type }: { type: string }) {
  const styles: Record<string, string> = {
    alert: "bg-rose-900/60 text-rose-300 border border-rose-700/40",
    demo: "bg-amber-900/40 text-amber-300 border border-amber-700/40",
    test_run: "bg-slate-700/50 text-slate-400 border border-slate-600/40",
  };
  const cls = styles[type] ?? styles.test_run;
  return (
    <span className={`px-1.5 py-px rounded text-[10px] font-mono leading-none ${cls}`}>
      {type === "test_run" ? "run" : type}
    </span>
  );
}

export default function LiveFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(true);
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);

  const syncState = () =>
    api.demo.state().then((s) => setRunning(s.simulator_running)).catch(() => {});

  // Load initial simulator state, then keep it fresh
  useEffect(() => {
    syncState();
    const id = setInterval(syncState, 5000);
    return () => clearInterval(id);
  }, []);

  const control = async (action: "start" | "stop" | "restart") => {
    setBusy(true);
    try {
      const res = await api.demo.simulator(action);
      setRunning(res.running);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const es = new EventSource(SSE_URL);

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.connected) return; // handshake ping

      const now = new Date();
      const ts = now.toLocaleTimeString("en-US", { hour12: false });

      setEvents((prev) => {
        const next = [
          ...prev,
          {
            id: ++counterRef.current,
            ts,
            event_type: payload.event_type ?? "test_run",
            device_id: payload.device_id ?? "",
            led_state: payload.led_state ?? "",
            status: payload.status ?? "",
            message: payload.message ?? "",
          },
        ];
        return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
      });
    };

    return () => es.close();
  }, []);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  return (
    <div className="flex flex-col h-full bg-[#0d1117] border border-slate-700/50 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50 bg-slate-900/60 shrink-0">
        <span className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300 tracking-wide">Live Event Feed</span>
          <span
            className={`text-[10px] px-1.5 py-px rounded-full border ${
              running
                ? "border-emerald-700/50 text-emerald-300 bg-emerald-900/20"
                : "border-slate-600/50 text-slate-400 bg-slate-800/40"
            }`}
            title="Loopback simulator process status"
          >
            simulator {running ? "running" : "stopped"}
          </span>
        </span>
        <div className="flex items-center gap-1.5">
          {running ? (
            <button
              onClick={() => control("stop")}
              disabled={busy}
              title="Stop the loopback simulator — no new test runs until restarted"
              className="text-[11px] px-2 py-0.5 rounded border border-rose-700/60 text-rose-300 hover:bg-rose-900/30 transition-colors disabled:opacity-40"
            >
              ◼ Stop
            </button>
          ) : (
            <button
              onClick={() => control("start")}
              disabled={busy}
              title="Start the loopback simulator"
              className="text-[11px] px-2 py-0.5 rounded border border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/30 transition-colors disabled:opacity-40"
            >
              ▶ Start
            </button>
          )}
          <button
            onClick={() => control("restart")}
            disabled={busy}
            title="Restart the loopback simulator"
            className="text-[11px] px-2 py-0.5 rounded border border-slate-600/60 text-slate-300 hover:bg-slate-700/40 transition-colors disabled:opacity-40"
          >
            ⟳ Restart
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800/60 bg-slate-900/30 shrink-0">
        <span className="text-[10px] text-slate-600 w-[52px]">time</span>
        <span className="text-[10px] text-slate-600 w-[38px]">type</span>
        <span className="text-[10px] text-slate-600">event</span>
      </div>

      {/* Scrollable log */}
      <div className="flex-1 overflow-y-auto font-mono text-xs px-0 py-1 space-y-px">
        {events.length === 0 && (
          <p className="text-slate-600 text-center mt-6 text-xs font-sans">
            Waiting for events…
          </p>
        )}
        {events.map((ev) => {
          const { text, color } = eventLabel(ev);
          return (
            <div
              key={ev.id}
              className="flex items-start gap-2 px-3 py-0.5 hover:bg-slate-800/30 transition-colors"
            >
              <span className="text-slate-600 shrink-0 w-[52px] tabular-nums">{ev.ts}</span>
              <span className="shrink-0 w-[38px]">
                <EventTypeTag type={ev.event_type} />
              </span>
              <span className={`${color} truncate`}>{text}</span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Footer count */}
      <div className="px-3 py-1.5 border-t border-slate-800/60 bg-slate-900/30 shrink-0 flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          {events.length} event{events.length !== 1 ? "s" : ""} · last {MAX_EVENTS} shown
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-600">
          <span
            className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-gray-600"}`}
          />
          {connected ? "SSE connected" : "connecting…"}
        </span>
      </div>
    </div>
  );
}
