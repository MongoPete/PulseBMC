"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import QueryTooltip from "@/components/QueryTooltip";
import RootCauseCard from "@/components/RootCauseCard";
import WorkOrderCard from "@/components/WorkOrderCard";
import RetrievedContextPanel from "@/components/RetrievedContextPanel";
import LedIndicator from "@/components/LedIndicator";
import { api, SSE_URL } from "@/lib/api";
import { fmtDateTime, fmtRelative } from "@/lib/time";

interface Alert {
  id: string;
  device_id: string;
  summary: string;
  severity: string;
  status: string;
  failure_rate: number;
  triggered_at: string;
}

interface DeviceInfo {
  hostname?: string;
  location?: { datacenter?: string; rack?: string; slot?: string };
  hardware?: { model?: string; pcie_slots?: number };
}

interface RootCause {
  alert_id: string;
  root_cause_hypothesis: string;
  evidence: string[];
  confidence: number;
  alternative_hypotheses: string[];
  next_diagnostic_steps: string[];
  retrieved_context_summary: string;
}

interface WorkOrder {
  title: string;
  priority: "P1" | "P2" | "P3" | "P4";
  assigned_technician: string;
  repair_steps: string[];
  estimated_duration_minutes: number;
  required_parts: string[];
  safety_notes: string[];
  historical_basis: string;
  originating_alert_id: string;
}

interface RetrievedDoc {
  collection: string;
  doc_id: string;
  similarity?: number;
  summary: string;
}

interface ChainResult {
  prediction: Record<string, unknown>;
  root_cause: RootCause;
  work_order: WorkOrder;
  agent_run_id: string;
  cached?: boolean;
  cached_at?: string;
}

interface KnowledgeBase {
  total_runs: number;
  latest_run_at: string | null;
  top_hypotheses: Array<{ id: string; count: number; avg_confidence: number; devices: string[]; last_seen: string }>;
  at_risk_components: Array<{ id: string; appearances: number; avg_failure_rate: number; error_codes: string[] }>;
  priority_distribution: Array<{ priority: string; count: number }>;
}

const SEVERITY_META: Record<string, { border: string; bg: string; badge: string; label: string }> = {
  critical: { border: "border-red-200",    bg: "bg-red-50",    badge: "bg-red-100 text-red-700",    label: "Critical" },
  high:     { border: "border-amber-200",  bg: "bg-amber-50",  badge: "bg-amber-100 text-amber-700", label: "High" },
  medium:   { border: "border-yellow-200", bg: "bg-yellow-50", badge: "bg-yellow-100 text-yellow-700", label: "Medium" },
  low:      { border: "border-slate-200",  bg: "bg-white",     badge: "bg-slate-100 text-slate-600", label: "Low" },
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<Record<string, DeviceInfo>>({});
  const [queryInfo, setQueryInfo] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ChainResult>>({});
  const [agentRuns, setAgentRuns] = useState<Record<string, Record<string, unknown>>>({});
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [kbOpen, setKbOpen] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [lastCapture, setLastCapture] = useState<{ msg: string; ts: string } | null>(null);
  const [newAlertIds, setNewAlertIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set());
  const lastRefreshAt = useRef<number>(0);

  const refresh = useCallback(async () => {
    const res = await api.alerts("open");
    const incoming: Alert[] = res.data ?? [];
    lastRefreshAt.current = Date.now();

    const fresh = incoming.filter((a) => !knownIds.current.has(a.id)).map((a) => a.id);
    if (knownIds.current.size > 0 && fresh.length > 0) {
      setNewAlertIds((prev) => new Set([...prev, ...fresh]));
      setTimeout(() => {
        setNewAlertIds((prev) => {
          const next = new Set(prev);
          fresh.forEach((id) => next.delete(id));
          return next;
        });
      }, 4000);
    }
    incoming.forEach((a) => knownIds.current.add(a.id));

    setAlerts((prev) => {
      const incomingMap = new Map(incoming.map((a) => [a.id, a]));
      const updated = prev.filter((a) => incomingMap.has(a.id)).map((a) => ({ ...a, ...incomingMap.get(a.id)! }));
      const existingIds = new Set(prev.map((a) => a.id));
      const brandNew = incoming.filter((a) => !existingIds.has(a.id));
      return [...brandNew, ...updated];
    });

    setQueryInfo(res.query_info ?? null);

    // Fetch device metadata for all alerts we don't have yet
    const newDeviceIds = incoming.map((a) => a.device_id).filter((id) => !devices[id]);
    newDeviceIds.forEach(async (id) => {
      try {
        const d = await api.device(id);
        setDevices((prev) => ({ ...prev, [id]: d as DeviceInfo }));
      } catch { /* ignore */ }
    });
  }, [devices]);

  useEffect(() => {
    refresh();
    api.knowledgeBase().then((k) => setKb(k as KnowledgeBase)).catch(() => {});
  }, [refresh]);

  useEffect(() => {
    const es = new EventSource(SSE_URL);
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.connected) return;
      const ts = new Date().toLocaleTimeString("en-US", { hour12: false });
      if (payload.event_type === "alert") {
        setLastCapture({ msg: payload.message || `Alert fired on ${payload.device_id}`, ts });
        if (Date.now() - lastRefreshAt.current > 3000) refresh();
      } else if (payload.device_id && payload.status === "fail") {
        setLastCapture({ msg: `Loopback FAIL on ${payload.device_id}`, ts });
      } else if (payload.device_id) {
        setLastCapture({ msg: `Loopback captured on ${payload.device_id}`, ts });
      }
    };
    return () => es.close();
  }, [refresh]);

  const runChain = async (alert: Alert, forceRefresh = false) => {
    setRunning(alert.id);
    try {
      const res = await api.agentChain(alert.id, alert.device_id, forceRefresh) as ChainResult;
      setResults((prev) => ({ ...prev, [alert.id]: res }));
      setExpandedResults((prev) => new Set([...prev, alert.id]));
      if (res.agent_run_id) {
        const run = await api.agentRun(res.agent_run_id);
        setAgentRuns((prev) => ({ ...prev, [alert.id]: run }));
      }
      api.knowledgeBase().then((k) => setKb(k as KnowledgeBase)).catch(() => {});
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(null);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Open Alerts</h1>
          <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
            Generated when failure rate exceeds 10%
            {queryInfo && <QueryTooltip queryInfo={queryInfo as Parameters<typeof QueryTooltip>[0]["queryInfo"]} label="query" />}
          </div>
        </div>
        <span className="text-xs border border-slate-200 px-2.5 py-1 rounded-full bg-white text-slate-600">
          {alerts.length} open
        </span>
      </div>

      {/* Live capture indicator */}
      <div className="flex items-center gap-2 mb-5 text-xs">
        <span className="flex items-center gap-1.5" style={{ color: "#009999" }}>
          <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: "#009999" }} />
          Live
        </span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-500 font-mono truncate">
          {lastCapture ? (
            <><span className="text-slate-400">{lastCapture.ts}</span> {lastCapture.msg}</>
          ) : (
            "Listening for loopback captures from Atlas…"
          )}
        </span>
      </div>

      {alerts.length === 0 && (
        <div className="text-slate-500 text-sm text-center py-12 bg-white border border-slate-200 rounded-lg">
          No open alerts — fleet is healthy.
        </div>
      )}

      <div id="alert-list" className="space-y-3">
        {alerts.map((alert, idx) => {
          const result = results[alert.id];
          const agentRun = agentRuns[alert.id];
          const isRunning = running === alert.id;
          const isNew = newAlertIds.has(alert.id);
          const meta = SEVERITY_META[alert.severity] ?? SEVERITY_META.low;
          const isExpanded = expandedResults.has(alert.id);
          const deviceInfo = devices[alert.device_id];

          return (
            <div
              key={alert.id}
              className={`border rounded-lg overflow-hidden transition-all bg-white
                ${meta.border}
                ${isNew ? "ring-2 ring-offset-1 ring-teal-500" : ""}`}
            >
              {isNew && (
                <div className="text-[11px] px-4 py-1 font-medium" style={{ background: "#e6f7f7", color: "#009999" }}>
                  ● Just arrived — captured live from Atlas
                </div>
              )}

              {/* Alert header */}
              <div className="p-4">
                {/* Affected hardware context */}
                {deviceInfo?.location && (
                  <div className="mb-3 flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded px-2.5 py-1.5">
                    <span className="font-medium text-slate-700">Hardware:</span>
                    <span className="font-mono">
                      {[deviceInfo.location.datacenter, deviceInfo.location.rack, deviceInfo.location.slot]
                        .filter(Boolean).join(" › ")}
                    </span>
                    {deviceInfo.hardware?.model && (
                      <span className="text-slate-400">· {deviceInfo.hardware.model}</span>
                    )}
                  </div>
                )}

                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <LedIndicator state="red" size="md" />
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{alert.device_id}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{alert.summary}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                        <span className="font-mono font-medium text-red-600">{(alert.failure_rate * 100).toFixed(1)}% failure rate</span>
                        <span title={fmtDateTime(alert.triggered_at)}>{fmtRelative(alert.triggered_at)}</span>
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium ${meta.badge}`}>{meta.label}</span>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    {!result ? (
                      <button
                        id={idx === 0 ? "run-ai-btn" : undefined}
                        onClick={() => runChain(alert)}
                        disabled={!!running}
                        className="text-xs px-3.5 py-2 rounded-lg border font-medium transition-all disabled:opacity-40"
                        style={{ borderColor: "#009999", color: "#009999" }}
                      >
                        {isRunning ? (
                          <span className="flex items-center gap-2">
                            <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                            Analysing…
                          </span>
                        ) : (
                          "Run AI Analysis"
                        )}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        {result.cached && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500">
                            Cached
                          </span>
                        )}
                        <button
                          onClick={() => setExpandedResults((prev) => {
                            const next = new Set(prev);
                            if (next.has(alert.id)) next.delete(alert.id); else next.add(alert.id);
                            return next;
                          })}
                          className="text-[11px] text-slate-500 hover:text-slate-800 border border-slate-200 px-2.5 py-1 rounded transition-colors"
                        >
                          {isExpanded ? "▾ Hide analysis" : "▸ Show analysis"}
                        </button>
                        <button
                          onClick={() => runChain(alert, true)}
                          disabled={!!running}
                          title="Re-run analysis (bypass cache)"
                          className="text-[11px] text-slate-400 hover:text-slate-700 border border-slate-200 px-2.5 py-1 rounded transition-colors disabled:opacity-40"
                        >
                          {isRunning ? "Running…" : "⟳ Re-analyze"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* AI Results — collapsed by default, expand on click */}
              {result && isExpanded && (
                <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span style={{ color: "#009999" }}>◈</span>
                    <span>AI analysis</span>
                    <span className="font-mono text-slate-400 ml-1">run …{result.agent_run_id?.slice(-8)}</span>
                  </div>

                  {Array.isArray(agentRun?.retrieved_documents) && (
                    <div id="retrieved-context-panel">
                      <RetrievedContextPanel
                        docs={agentRun.retrieved_documents as RetrievedDoc[]}
                        agentRunId={result.agent_run_id}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" id="rca-wo-grid">
                    <div>
                      <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Root Cause</p>
                      <RootCauseCard rca={result.root_cause} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Work Order</p>
                      <WorkOrderCard wo={result.work_order} deviceInfo={deviceInfo} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Knowledge Base */}
      {kb && kb.total_runs > 0 && (
        <div className="mt-8 border border-slate-200 rounded-lg overflow-hidden bg-white">
          <button
            onClick={() => setKbOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <span className="flex items-center gap-2.5 text-sm text-slate-700 font-medium">
              <span style={{ color: "#009999" }}>◈</span>
              AI Knowledge Base
              <span className="text-xs font-normal text-slate-400">
                — {kb.total_runs} stored run{kb.total_runs !== 1 ? "s" : ""}
              </span>
            </span>
            <span className="text-slate-400 text-xs">{kbOpen ? "▾" : "▸"}</span>
          </button>

          {kbOpen && (
            <div className="border-t border-slate-100 p-4 space-y-5">
              {kb.top_hypotheses.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Recurring Root Cause Hypotheses</h3>
                  <div className="space-y-1.5">
                    {kb.top_hypotheses.slice(0, 5).map((h, i) => (
                      <div key={i} className="flex items-start gap-3 text-xs bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                        <span className="text-slate-400 shrink-0 tabular-nums w-4">{i + 1}.</span>
                        <span className="text-slate-700 flex-1 leading-relaxed">{h.id || "—"}</span>
                        <div className="shrink-0 flex items-center gap-2 text-slate-500">
                          <span className="font-medium" style={{ color: "#009999" }}>{(h.avg_confidence * 100).toFixed(0)}%</span>
                          <span className="text-slate-300">·</span>
                          <span>{h.count}×</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {kb.at_risk_components.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Most Flagged Components</h3>
                    <div className="space-y-1.5">
                      {kb.at_risk_components.slice(0, 6).map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-slate-600 w-28 shrink-0 truncate">{c.id || "—"}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                            <div
                              className="bg-red-400 h-1.5 rounded-full"
                              style={{ width: `${Math.min(100, (c.avg_failure_rate ?? 0) * 100)}%` }}
                            />
                          </div>
                          <span className="text-slate-400 w-8 text-right">{c.appearances}×</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {kb.priority_distribution.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Work Order Priorities</h3>
                    <div className="space-y-1.5">
                      {kb.priority_distribution.map((p) => {
                        const max = Math.max(...kb.priority_distribution.map((x) => x.count));
                        const colors: Record<string, string> = { P1: "bg-red-500", P2: "bg-amber-400", P3: "bg-yellow-400", P4: "bg-slate-300" };
                        return (
                          <div key={p.priority} className="flex items-center gap-2 text-xs">
                            <span className="font-mono text-slate-600 w-7 shrink-0">{p.priority}</span>
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                              <div className={`${colors[p.priority] ?? "bg-slate-400"} h-1.5 rounded-full`}
                                   style={{ width: `${(p.count / max) * 100}%` }} />
                            </div>
                            <span className="text-slate-400 w-6 text-right">{p.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
