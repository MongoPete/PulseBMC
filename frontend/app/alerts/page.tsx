"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import QueryTooltip from "@/components/QueryTooltip";
import RootCauseCard from "@/components/RootCauseCard";
import WorkOrderCard from "@/components/WorkOrderCard";
import RetrievedContextPanel from "@/components/RetrievedContextPanel";
import LedIndicator from "@/components/LedIndicator";
import ConceptBar from "@/components/ConceptBar";
import PageShell, { PageMain } from "@/components/PageShell";
import SimSessionBanner from "@/components/SimSessionBanner";
import { useSessionMode } from "@/lib/sessionMode";
import ChangeStreamLiveLabel from "@/components/ChangeStreamLiveLabel";
import RuntimeDebugPanel from "@/components/RuntimeDebugPanel";
import { api } from "@/lib/api";
import { fmtDateTime, fmtRelative } from "@/lib/time";
import { trackedTimeout } from "@/lib/runtimeDebug";
import { subscribeLiveMessages, subscribeLiveStatus } from "@/lib/liveStream";
import { fmtClock } from "@/lib/time";

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

interface TestRunComponent {
  component_id: string;
  result: string;
  error_code?: string;
  core_results?: Array<{ core_id: string; result: string; temp_c?: number }>;
}

interface LatestFailRun {
  status: string;
  failure_mode?: string;
  results?: { components?: TestRunComponent[] };
  nvme_smart?: {
    media_errors?: number;
    num_err_log_entries?: number;
    temperature?: number;
    critical_warning?: number;
  };
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
  const sessionMode = useSessionMode();
  const searchParams = useSearchParams();
  const targetDeviceId = searchParams.get("device_id");
  const autoTriggeredRef = useRef(false);

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<Record<string, DeviceInfo>>({});
  const [queryInfo, setQueryInfo] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ChainResult>>({});
  const [agentRuns, setAgentRuns] = useState<Record<string, Record<string, unknown>>>({});
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [kbOpen, setKbOpen] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [freshResultIds, setFreshResultIds] = useState<Set<string>>(new Set());
  const [latestRuns, setLatestRuns] = useState<Record<string, LatestFailRun>>({});
  const [lastCapture, setLastCapture] = useState<{ msg: string; ts: string } | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const [newAlertIds, setNewAlertIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set());
  const lastRefreshAt = useRef<number>(0);
  const devicesRef = useRef<Record<string, DeviceInfo>>({});
  const highlightTimeouts = useRef<Map<number, () => void>>(new Map());
  const highlightTimerSeq = useRef(0);
  const deviceFetchInFlight = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    devicesRef.current = devices;
  }, [devices]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      highlightTimeouts.current.forEach((clear) => clear());
      highlightTimeouts.current.clear();
    };
  }, []);

  const refresh = useCallback(async () => {
    const res = await api.alerts("open");
    const incoming: Alert[] = res.data ?? [];
    lastRefreshAt.current = Date.now();
    const incomingIds = new Set(incoming.map((a) => a.id));

    const fresh = incoming.filter((a) => !knownIds.current.has(a.id)).map((a) => a.id);
    if (knownIds.current.size > 0 && fresh.length > 0) {
      setNewAlertIds((prev) => new Set([...prev, ...fresh]));
      const timerId = ++highlightTimerSeq.current;
      const t = trackedTimeout(() => {
        setNewAlertIds((prev) => {
          const next = new Set(prev);
          fresh.forEach((id) => next.delete(id));
          return next;
        });
        highlightTimeouts.current.delete(timerId);
      }, 4000);
      highlightTimeouts.current.set(timerId, t.clear);
    }
    knownIds.current = incomingIds;

    setAlerts((prev) => {
      const incomingMap = new Map(incoming.map((a) => [a.id, a]));
      const updated = prev.filter((a) => incomingMap.has(a.id)).map((a) => ({ ...a, ...incomingMap.get(a.id)! }));
      const existingIds = new Set(prev.map((a) => a.id));
      const brandNew = incoming.filter((a) => !existingIds.has(a.id));
      return [...brandNew, ...updated];
    });

    // Prune per-alert caches for closed alerts to prevent unbounded growth.
    setResults((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => incomingIds.has(id)))
    );
    setAgentRuns((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => incomingIds.has(id)))
    );
    setExpandedResults((prev) => new Set([...prev].filter((id) => incomingIds.has(id))));
    setFreshResultIds((prev) => new Set([...prev].filter((id) => incomingIds.has(id))));
    setNewAlertIds((prev) => new Set([...prev].filter((id) => incomingIds.has(id))));

    // Prune thermal run cache for devices no longer in any open alert.
    const activeDeviceIds = new Set(incoming.map((a) => a.device_id));
    setLatestRuns((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => activeDeviceIds.has(id)))
    );

    setQueryInfo(res.query_info ?? null);

    // Fetch device metadata for devices we have not fetched yet.
    const candidateDeviceIds = Array.from(new Set(incoming.map((a) => a.device_id)));
    candidateDeviceIds.forEach(async (deviceId) => {
      if (deviceFetchInFlight.current.has(deviceId)) return;
      if (devicesRef.current[deviceId]) return;
      deviceFetchInFlight.current.add(deviceId);
      try {
        const d = await api.device(deviceId);
        if (!mountedRef.current) return;
        setDevices((prev) => (prev[deviceId] ? prev : { ...prev, [deviceId]: d as DeviceInfo }));
      } catch {
        /* ignore */
      } finally {
        deviceFetchInFlight.current.delete(deviceId);
      }
    });
  }, []);

  useEffect(() => {
    refresh();
    api.knowledgeBase().then((k) => setKb(k as KnowledgeBase)).catch(() => {});
  }, [refresh]);

  useEffect(() => {
    const unsubStatus = subscribeLiveStatus(setSseConnected);
    const unsubMsg = subscribeLiveMessages((payload) => {
      if (payload.connected) return;
      const ts = payload.started_at
        ? fmtClock(payload.started_at)
        : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      if (payload.event_type === "alert") {
        setLastCapture({ msg: payload.message || `Alert fired on ${payload.device_id}`, ts });
        if (Date.now() - lastRefreshAt.current > 3000) refresh();
      } else if (payload.device_id && payload.status === "fail") {
        setLastCapture({ msg: `Loopback FAIL on ${payload.device_id}`, ts });
      } else if (payload.device_id) {
        setLastCapture({ msg: `Loopback captured on ${payload.device_id}`, ts });
      }
    });
    return () => {
      unsubStatus();
      unsubMsg();
    };
  }, [refresh]);

  const runChain = async (alert: Alert, forceRefresh = false) => {
    setRunning(alert.id);
    try {
      const [res, runsRes] = await Promise.all([
        api.agentChain(alert.id, alert.device_id, forceRefresh) as Promise<ChainResult>,
        api.testRuns(alert.device_id, 5),
      ]);
      const failRun = (runsRes.data as LatestFailRun[] ?? []).find((r) => r.status === "fail");
      if (failRun) setLatestRuns((prev) => ({ ...prev, [alert.device_id]: failRun }));
      setResults((prev) => ({ ...prev, [alert.id]: res }));
      setExpandedResults((prev) => new Set([...prev, alert.id]));
      // Mark as fresh only when newly generated (not a cache hit) so we animate it
      if (!res.cached) {
        setFreshResultIds((prev) => new Set([...prev, alert.id]));
      }
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

  // Auto-trigger analysis when arriving via "Run Analysis" from the fleet context menu.
  useEffect(() => {
    if (!targetDeviceId || autoTriggeredRef.current || alerts.length === 0) return;
    const match = alerts.find((a) => a.device_id === targetDeviceId);
    if (!match || results[match.id]) return;
    autoTriggeredRef.current = true;
    runChain(match);
  // runChain is stable within a render; targetDeviceId and alerts drive re-evaluation
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, targetDeviceId]);

  const displayedAlerts = targetDeviceId
    ? alerts.filter((a) => a.device_id === targetDeviceId)
    : alerts;

  return (
    <PageShell>
      <ConceptBar />
      <PageMain>
      {sessionMode && <SimSessionBanner compact />}
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-bold text-slate-800">Open Alerts</h1>
          <div className="text-sm text-slate-500 mt-0.5">
            <p>Raised when loopback fault rate exceeds threshold</p>
            {queryInfo && (
              <div className="mt-1.5">
                <QueryTooltip queryInfo={queryInfo as Parameters<typeof QueryTooltip>[0]["queryInfo"]} />
              </div>
            )}
          </div>
        </div>
        <span className="text-xs border border-slate-200 px-2.5 py-1 rounded-full bg-white text-slate-600 shrink-0 self-start">
          {alerts.length} open
        </span>
      </div>

      {/* Device filter banner — shown when arriving from "Run Analysis" context menu */}
      {targetDeviceId && (
        <div className="mb-4 flex items-center gap-2 text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white">
          <span className="text-slate-500">Analyzing</span>
          <span className="font-mono font-semibold text-slate-800">{targetDeviceId}</span>
          {displayedAlerts.length === 0 ? (
            <span className="text-slate-400 text-xs">— no open alerts for this device</span>
          ) : (
            <span className="text-slate-400 text-xs">— {displayedAlerts.length} alert{displayedAlerts.length !== 1 ? "s" : ""}</span>
          )}
          <a
            href="/alerts"
            className="ml-auto text-xs hover:underline"
            style={{ color: "#009999" }}
          >
            Show all alerts
          </a>
        </div>
      )}

      {/* Live capture indicator */}
      <div className="flex items-center gap-2 mb-5 text-xs">
        <ChangeStreamLiveLabel connected={sseConnected} compact />
        <span className="text-slate-400">·</span>
        <span className="text-slate-500 font-mono truncate">
          {lastCapture ? (
            <><span className="text-slate-400">{lastCapture.ts}</span> {lastCapture.msg}</>
          ) : (
            "Monitoring for new failures"
          )}
        </span>
      </div>

      {alerts.length === 0 && (
        <div className="text-slate-500 text-sm text-center py-12 bg-white border border-slate-200 rounded-lg">
          No open alerts — fleet is healthy.
        </div>
      )}

      <div id="alert-list" className="space-y-3">
        {displayedAlerts.map((alert, idx) => {
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
                <div className="text-[11px] px-4 py-1 font-medium border-b border-slate-100" style={{ color: "#009999" }}>
                  New alert
                </div>
              )}

              {/* Alert card body */}
              <div className="p-4">

                {/* Row 1: device identity + severity + timestamp */}
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <LedIndicator state="red" size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{alert.device_id}</span>
                        <span className="font-mono text-xs font-medium text-red-600">{(alert.failure_rate * 100).toFixed(1)}% fail rate</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.badge}`}>{meta.label}</span>
                        <span className="text-xs text-slate-400" title={fmtDateTime(alert.triggered_at)}>{fmtRelative(alert.triggered_at)}</span>
                      </div>
                      {/* Physical location — second line */}
                      {deviceInfo?.location && (
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                          {[deviceInfo.location.datacenter, deviceInfo.location.rack, deviceInfo.location.slot
                            ? `Slot ${deviceInfo.location.slot}` : null]
                            .filter(Boolean).join(" › ")}
                          {deviceInfo.hardware?.model && <span className="text-slate-300"> · {deviceInfo.hardware.model}</span>}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* detect → analyze → isolate → act */}
                  <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
                    {/* Step 1: Analyze (always available) */}
                    {!result ? (
                      <button
                        id={idx === 0 ? "run-ai-btn" : undefined}
                        onClick={() => runChain(alert)}
                        disabled={!!running}
                        className="text-xs px-3 py-1.5 rounded border font-medium transition-colors disabled:opacity-40"
                        style={{ borderColor: "#009999", color: "#009999" }}
                      >
                        {isRunning ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                            Running…
                          </span>
                        ) : "Analyze"}
                      </button>
                    ) : (
                      <>
                        {/* Step 3: Isolate — appears after analysis */}
                        <button
                          onClick={async () => {
                            try { await api.isolateDevice(alert.device_id, "maintenance"); }
                            catch { /* ignore */ }
                          }}
                          className="text-xs px-3 py-1.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
                        >
                          Isolate
                        </button>
                        <button
                          onClick={() => setExpandedResults((prev) => {
                            const next = new Set(prev);
                            if (next.has(alert.id)) next.delete(alert.id); else next.add(alert.id);
                            return next;
                          })}
                          className="text-xs text-slate-600 hover:text-slate-800 border border-slate-200 px-3 py-1.5 rounded transition-colors"
                        >
                          {isExpanded ? "Hide analysis" : "Show analysis"}
                        </button>
                        <button
                          onClick={() => runChain(alert, true)}
                          disabled={!!running}
                          title="Re-run (bypass cache)"
                          className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 px-2 py-1.5 rounded transition-colors disabled:opacity-40"
                        >
                          {isRunning ? "Running…" : "↺"}
                        </button>
                        {result.cached && <span className="text-[10px] text-slate-400">cached</span>}
                      </>
                    )}
                    {/* Step 2: Rerun — always visible */}
                    <button
                      onClick={async () => {
                        try { await (api.demo as { rerun: (id: string) => Promise<unknown> }).rerun(alert.device_id); }
                        catch { /* ignore */ }
                      }}
                      className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Rerun Test
                    </button>
                  </div>
                </div>

                {/* Signal summary — primary diagnostic context */}
                <div className="mt-2.5 pl-7">
                  <p className="text-xs text-slate-700 leading-relaxed">{alert.summary}</p>
                  {/* Next step hint once analyzed but collapsed */}
                  {result && !isExpanded && result.work_order?.repair_steps?.[0] && (
                    <p className="text-[11px] text-slate-500 mt-1.5 border-t border-slate-100 pt-1.5">
                      <span className="text-slate-400">Next step →</span> {result.work_order.repair_steps[0]}
                    </p>
                  )}
                </div>
              </div>

              {/* Inline "generating" response — visible while agent is running */}
              {isRunning && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ background: "#009999" }} />
                  <span className="text-xs text-slate-500 font-mono">
                    Running fault isolation
                    <span className="animate-pulse">…</span>
                  </span>
                </div>
              )}

              {/* Analysis — collapsed by default */}
              {result && isExpanded && (
                <div className="border-t border-slate-100 p-4 space-y-4 bg-slate-50">
                  {Array.isArray(agentRun?.retrieved_documents) && (
                    <div id="retrieved-context-panel">
                      <RetrievedContextPanel
                        docs={agentRun.retrieved_documents as RetrievedDoc[]}
                        agentRunId={result.agent_run_id}
                      />
                    </div>
                  )}

                  {/* Sub-partition Thermal Evidence */}
                  {latestRuns[alert.device_id] && (() => {
                    const run = latestRuns[alert.device_id];
                    const allComps = run.results?.components ?? [];
                    if (allComps.length === 0) return null;
                    return (
                      <div className="rounded-lg border border-slate-200 bg-white p-4">
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                            Sub-partition Thermal Evidence
                          </p>
                          <span className="text-[10px] text-slate-400">baseline 38–62°C</span>
                        </div>
                        <div className="space-y-3">
                          {allComps.map((comp) => (
                            <div key={comp.component_id}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`w-2 h-2 rounded-sm shrink-0 ${comp.result === "fail" ? "bg-red-500" : "bg-green-400"}`} />
                                <span className="text-xs font-mono text-slate-600">{comp.component_id}</span>
                                {comp.error_code && comp.result === "fail" && (
                                  <span className="text-[10px] font-mono text-red-500 bg-red-50 px-1.5 py-0.5 rounded">{comp.error_code}</span>
                                )}
                                {comp.result !== "fail" && (
                                  <span className="text-[10px] text-green-600">all cores pass</span>
                                )}
                              </div>
                              {comp.core_results && comp.core_results.length > 0 && (
                                <>
                                  <div className="ml-4 flex gap-1.5 flex-wrap">
                                    {comp.core_results.map((core) => (
                                      <div
                                        key={core.core_id}
                                        title={`${core.core_id} · ${core.result}${core.temp_c != null ? ` · ${core.temp_c}°C` : ""}`}
                                        className={`w-7 h-7 rounded border text-[9px] font-mono flex items-center justify-center font-bold ${
                                          core.result === "fail"
                                            ? "bg-red-50 border-red-300 text-red-600"
                                            : "bg-white border-slate-200 text-slate-400"
                                        }`}
                                      >
                                        {core.core_id.replace("core_", "")}
                                      </div>
                                    ))}
                                  </div>
                                  {comp.core_results.some((c) => c.temp_c != null) && (
                                    <div className="ml-4 flex gap-3 pt-1.5 text-[10px] font-mono flex-wrap">
                                      {comp.core_results
                                        .filter((c) => c.temp_c != null)
                                        .map((c) => (
                                          <span
                                            key={c.core_id}
                                            className={
                                              c.temp_c! > 85
                                                ? "text-red-600 font-semibold"
                                                : c.temp_c! > 70
                                                ? "text-amber-600"
                                                : "text-slate-400"
                                            }
                                          >
                                            {c.core_id.replace("core_", "C")}: {c.temp_c}°
                                          </span>
                                        ))}
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                        {(run.nvme_smart || run.failure_mode) && (
                          <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-4 text-[10px] font-mono text-slate-500">
                            {run.failure_mode && (
                              <span>
                                mode: <span className="text-amber-600 font-semibold">{run.failure_mode}</span>
                              </span>
                            )}
                            {run.nvme_smart && (
                              <>
                                <span>media_errors: <span className={run.nvme_smart.media_errors ? "text-red-500 font-semibold" : ""}>{run.nvme_smart.media_errors ?? 0}</span></span>
                                <span>err_log: {run.nvme_smart.num_err_log_entries ?? 0}</span>
                                <span>nvme_temp: {run.nvme_smart.temperature ?? "?"}°C</span>
                                {!!run.nvme_smart.critical_warning && (
                                  <span className="text-red-500 font-semibold">critical_warning={run.nvme_smart.critical_warning}</span>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4" id="rca-wo-grid">
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <p className="text-xs text-slate-500 font-medium">Suspected cause</p>
                        {freshResultIds.has(alert.id) && !result.cached && (
                          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded border" style={{ color: "#009999", borderColor: "#009999", background: "#f0fdfa" }}>
                            live
                          </span>
                        )}
                        {result.cached && (
                          <span className="text-[9px] text-slate-400 font-medium">cached</span>
                        )}
                      </div>
                      <RootCauseCard rca={result.root_cause} animate={freshResultIds.has(alert.id) && !result.cached} />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-2 font-medium">Work order</p>
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
              Analysis History
              <span className="text-xs font-normal text-slate-400">
                — {kb.total_runs} run{kb.total_runs !== 1 ? "s" : ""}
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
      <RuntimeDebugPanel
        title="Alerts Runtime"
        metrics={{
          open_alerts: alerts.length,
          results_cache: Object.keys(results).length,
          agent_runs_cache: Object.keys(agentRuns).length,
          expanded: expandedResults.size,
          fresh_results: freshResultIds.size,
          new_highlights: newAlertIds.size,
          known_ids: knownIds.current.size,
          cached_devices: Object.keys(devices).length,
          pending_highlight_timers: highlightTimeouts.current.size,
        }}
      />
      </PageMain>
    </PageShell>
  );
}
