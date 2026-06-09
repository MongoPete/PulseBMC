"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DeviceGrid from "@/components/DeviceGrid";
import DemoControls from "@/components/DemoControls";
import LiveFeed from "@/components/LiveFeed";
import ConceptBar from "@/components/ConceptBar";
import RuntimeDebugPanel from "@/components/RuntimeDebugPanel";
import type { LedState } from "@/components/LedIndicator";
import LedIndicator from "@/components/LedIndicator";
import { api } from "@/lib/api";
import { fmtAgeWithClock } from "@/lib/time";
import { trackedInterval, trackedTimeout } from "@/lib/runtimeDebug";
import { subscribeLiveMessages } from "@/lib/liveStream";
import { subscribeSimState } from "@/lib/simState";

interface Device {
  device_id: string;
  hostname: string;
  status: string;
  location?: { datacenter?: string; rack?: string; slot?: string };
}

interface DrawerComponent {
  component_id: string;
  result: string;
  error_code?: string;
  core_results?: Array<{ core_id: string; result: string; temp_c?: number; latency_ms?: number }>;
}

interface DrawerRun {
  id: string;
  started_at: string;
  status: string;
  led_state: LedState;
  duration_ms: number;
  failure_mode?: string;
  results?: { components?: DrawerComponent[] };
}

interface DrawerData {
  device: Device | null;
  runs: DrawerRun[];
  loading: boolean;
}

// ── Device Drawer ──────────────────────────────────────────────────────────────

function DeviceDrawer({
  deviceId,
  ledState,
  data,
  onClose,
  onAction,
  rerunning,
  isolating,
}: {
  deviceId: string;
  ledState: LedState;
  data: DrawerData;
  onClose: () => void;
  onAction: (action: "logs" | "analysis" | "rerun" | "isolate") => void;
  rerunning: boolean;
  isolating: boolean;
}) {
  const { device, runs, loading } = data;
  const isIsolated = device?.status === "maintenance";
  const latestRun = runs[0];
  const components = latestRun?.results?.components ?? [];
  const failingComponents = components.filter((c) => c.result === "fail");

  const [expandedCompId, setExpandedCompId] = useState<string | null>(null);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-30 bg-black/10" onClick={onClose} />

      {/* Drawer */}
      <aside
        className="fixed right-0 top-12 bottom-0 z-40 w-96 bg-white border-l shadow-md flex flex-col"
        style={{ borderColor: "#e2e8f0" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b" style={{ borderColor: "#e2e8f0" }}>
          <div className="flex items-start gap-3">
            <LedIndicator state={ledState} size="md" />
            <div>
              <p className="font-semibold text-slate-800 text-base">{deviceId}</p>
              {device && (
                <>
                  <p className="text-xs text-slate-500 mt-0.5">{device.hostname}</p>
                  {device.location && (
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">
                      {[device.location.datacenter, device.location.rack, device.location.slot]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl leading-none mt-0.5">
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5 text-sm text-slate-400">Loading…</div>
          ) : (
            <>
              {/* Component Health — expandable rows */}
              {components.length > 0 && (
                <div className="px-5 py-4 border-b" style={{ borderColor: "#f1f5f9" }}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Component Health
                    <span className="ml-1 font-normal normal-case text-slate-400">(click to inspect)</span>
                  </p>
                  {failingComponents.length > 0 && (
                    <div className="mb-2 px-2.5 py-1.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                      Failing: {failingComponents.map((c) => `${c.component_id}${c.error_code ? ` (${c.error_code})` : ""}`).join(", ")}
                    </div>
                  )}
                  <div className="space-y-1">
                    {components.map((comp) => {
                      const isOpen = expandedCompId === comp.component_id;
                      const isFail = comp.result === "fail";
                      return (
                        <div key={comp.component_id}>
                          <button
                            onClick={() => setExpandedCompId(isOpen ? null : comp.component_id)}
                            className={`w-full flex items-center gap-2 text-left rounded px-2 py-1.5 transition-colors ${
                              isOpen ? "bg-slate-100" : "hover:bg-slate-50"
                            }`}
                          >
                            <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${isFail ? "bg-red-500" : "bg-green-400"}`} />
                            <span className="text-xs font-mono text-slate-700 flex-1">{comp.component_id}</span>
                            {comp.error_code && isFail && (
                              <span className="text-[10px] font-mono text-red-500 bg-red-50 px-1.5 py-0.5 rounded">{comp.error_code}</span>
                            )}
                            <span className={`text-[10px] font-semibold shrink-0 ${isFail ? "text-red-600" : "text-green-600"}`}>
                              {comp.result.toUpperCase()}
                            </span>
                            <span className="text-slate-300 text-[10px]">{isOpen ? "▾" : "▸"}</span>
                          </button>

                          {isOpen && (
                            <div className="ml-5 mt-1 mb-2 rounded border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-1.5">
                              {comp.core_results && comp.core_results.length > 0 ? (
                                <>
                                  <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1.5">Cores</p>
                                  <div className="flex gap-1.5 flex-wrap">
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
                                    <div className="flex gap-3 pt-1 text-[10px] text-slate-500 font-mono flex-wrap">
                                      {comp.core_results.filter((c) => c.temp_c != null).map((c) => (
                                        <span key={c.core_id} className={c.temp_c! > 70 ? "text-amber-600" : ""}>
                                          {c.core_id.replace("core_", "C")}: {c.temp_c}°
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <p className="text-[10px] text-slate-400">
                                  {isFail
                                    ? <>Status: <span className="text-red-600 font-semibold">FAIL</span>{comp.error_code && <span className="ml-1 font-mono text-red-500">{comp.error_code}</span>}</>
                                    : <span className="text-green-600 font-semibold">All cores passed</span>
                                  }
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Recent runs — expandable to show component breakdown */}
              <div className="px-5 py-4 border-b" style={{ borderColor: "#f1f5f9" }}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  Recent Tests
                  <span className="ml-1 font-normal normal-case text-slate-400">(click for breakdown)</span>
                </p>
                <div className="space-y-1">
                  {runs.slice(0, 8).map((run) => {
                    const isOpen = expandedRunId === run.id;
                    const runComponents = run.results?.components ?? [];
                    return (
                      <div key={run.id}>
                        <button
                          onClick={() => setExpandedRunId(isOpen ? null : run.id)}
                          className={`w-full flex items-center gap-2 text-xs text-left rounded px-2 py-1.5 transition-colors ${
                            isOpen ? "bg-slate-100" : "hover:bg-slate-50"
                          }`}
                        >
                          <LedIndicator state={run.led_state} size="sm" />
                          <span className={`w-8 font-semibold shrink-0 ${run.status === "fail" ? "text-red-600" : "text-green-600"}`}>
                            {run.status.toUpperCase()}
                          </span>
                          <span className="text-slate-400 flex-1 tabular-nums">{fmtAgeWithClock(run.started_at)}</span>
                          {run.failure_mode && run.failure_mode !== "none" && (
                            <span className="text-[10px] text-amber-500 capitalize">{run.failure_mode}</span>
                          )}
                          {run.duration_ms != null && (
                            <span className="text-slate-400 font-mono">{run.duration_ms}ms</span>
                          )}
                          <span className="text-slate-300 text-[10px]">{isOpen ? "▾" : "▸"}</span>
                        </button>

                        {isOpen && (
                          <div className="ml-4 mt-1 mb-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
                            {runComponents.length > 0 ? (
                              <div className="space-y-1">
                                {runComponents.map((c) => (
                                  <div key={c.component_id} className="flex items-center gap-2 text-[11px]">
                                    <span className={`w-2 h-2 rounded-sm shrink-0 ${c.result === "fail" ? "bg-red-500" : "bg-green-400"}`} />
                                    <span className="font-mono text-slate-600 flex-1">{c.component_id}</span>
                                    {c.error_code && c.result === "fail" && (
                                      <span className="font-mono text-red-500 text-[10px]">{c.error_code}</span>
                                    )}
                                    <span className={`font-semibold ${c.result === "fail" ? "text-red-600" : "text-green-600"}`}>
                                      {c.result.toUpperCase()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[10px] text-slate-400">No component detail available.</p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {runs.length === 0 && (
                    <p className="text-xs text-slate-400">No test runs recorded.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 py-4 border-t space-y-2" style={{ borderColor: "#e2e8f0" }}>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onAction("analysis")}
              className="text-xs px-3 py-2 rounded-lg border font-medium transition-colors hover:opacity-80"
              style={{ borderColor: "#009999", color: "#009999" }}
            >
              Run Analysis
            </button>
            <button
              onClick={() => onAction("rerun")}
              disabled={rerunning}
              className="text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {rerunning ? (
                <>
                  <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
                  Running…
                </>
              ) : "Rerun Test"}
            </button>
          </div>
          <button
            onClick={() => onAction("logs")}
            className="w-full text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            View Full Detail
          </button>
          <button
            onClick={() => onAction("isolate")}
            disabled={isolating}
            className={`w-full text-xs px-3 py-2 rounded-lg border font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 ${
              isIsolated
                ? "border-slate-300 text-slate-700 hover:bg-slate-50"
                : "border-amber-300 text-amber-700 hover:bg-amber-50"
            }`}
          >
            {isolating ? (
              <>
                <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                Updating…
              </>
            ) : isIsolated ? "Restore Device" : "Isolate Device"}
          </button>
        </div>
      </aside>
    </>
  );
}

// ── Fleet Page ─────────────────────────────────────────────────────────────────

export default function FleetPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[]>([]);
  const [liveStates, setLiveStates] = useState<Record<string, LedState>>({});
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoOpen, setDemoOpen] = useState(false);
  const [liveFeedOpen, setLiveFeedOpen] = useState(false);
  const [simulatorRunning, setSimulatorRunning] = useState<boolean | null>(null);
  const [rerunningDeviceId, setRerunningDeviceId] = useState<string | null>(null);
  const [isolatingDeviceId, setIsolatingDeviceId] = useState<string | null>(null);
  const refreshInFlightRef = useRef(false);

  // Drawer state
  const [drawerDeviceId, setDrawerDeviceId] = useState<string | null>(null);
  const [drawerData, setDrawerData] = useState<DrawerData>({ device: null, runs: [], loading: false });
  const reopenDrawerTimerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      if (reopenDrawerTimerRef.current) reopenDrawerTimerRef.current();
    };
  }, []);

  const refreshAll = useCallback(async () => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    try {
      const [devRes, stateRes] = await Promise.allSettled([
        api.devices(),
        api.fleetStates(),
      ]);

      if (devRes.status === "fulfilled") {
        // Keep fleet rendering resilient even if companion calls fail.
        const payload = devRes.value as { data?: Device[]; devices?: Device[]; items?: Device[] };
        setDevices(payload.data ?? payload.devices ?? payload.items ?? []);
      }

      if (stateRes.status === "fulfilled") {
        setLiveStates((prev) => ({ ...prev, ...(stateRes.value as Record<string, LedState>) }));
      }

      if (devRes.status === "fulfilled" || stateRes.status === "fulfilled") {
        setLastRefresh(new Date());
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
      refreshInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    return subscribeSimState(setSimulatorRunning);
  }, []);

  useEffect(() => {
    if (simulatorRunning !== true) return;
    // SSE carries live LED changes; this is only a low-frequency reconciliation.
    const i = trackedInterval(refreshAll, 60000);
    return () => i.clear();
  }, [refreshAll, simulatorRunning]);

  useEffect(() => {
    return subscribeLiveMessages((payload) => {
      const deviceId = payload.device_id;
      if (deviceId && payload.led_state) {
        setLiveStates((prev) => ({ ...prev, [deviceId]: payload.led_state as LedState }));
        if (payload.led_state !== "amber") {
          setPulses((prev) => ({ ...prev, [deviceId]: Date.now() }));
        }
      }
    });
  }, []);

  // Open drawer and fetch data for a device
  const openDrawer = useCallback(async (deviceId: string) => {
    setDrawerDeviceId(deviceId);
    setDrawerData({ device: null, runs: [], loading: true });
    try {
      const [devRes, runsRes] = await Promise.all([
        api.device(deviceId),
        api.testRuns(deviceId, 10),
      ]);
      setDrawerData({ device: devRes as Device, runs: runsRes.data ?? [], loading: false });
    } catch {
      setDrawerData((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  const handleDeviceAction = useCallback(async (deviceId: string, action: "logs" | "analysis" | "rerun" | "isolate") => {
    if (action === "logs") {
      setDrawerDeviceId(null);
      router.push(`/devices/${deviceId}`);
    } else if (action === "analysis") {
      router.push(`/alerts?device_id=${deviceId}`);
    } else if (action === "rerun") {
      if (rerunningDeviceId) return;
      setRerunningDeviceId(deviceId);
      try {
        await api.demo.rerun(deviceId);
        if (drawerDeviceId === deviceId) {
          if (reopenDrawerTimerRef.current) reopenDrawerTimerRef.current();
          const t = trackedTimeout(() => openDrawer(deviceId), 1500);
          reopenDrawerTimerRef.current = t.clear;
        }
      } catch { /* ignore */ } finally {
        setRerunningDeviceId(null);
      }
    } else if (action === "isolate") {
      if (isolatingDeviceId) return;
      setIsolatingDeviceId(deviceId);
      try {
        const currentStatus = devices.find((d) => d.device_id === deviceId)?.status;
        const newStatus = currentStatus === "maintenance" ? "online" : "maintenance";
        await api.isolateDevice(deviceId, newStatus);
        await refreshAll();
        if (drawerDeviceId === deviceId) {
          openDrawer(deviceId);
        }
      } catch { /* ignore */ } finally {
        setIsolatingDeviceId(null);
      }
    }
  }, [devices, drawerDeviceId, isolatingDeviceId, openDrawer, refreshAll, rerunningDeviceId, router]);

  const failureCount = Object.values(liveStates).filter((s) => s === "red").length;
  const amberCount = Object.values(liveStates).filter((s) => s === "amber").length;

  return (
    <div>
      <ConceptBar />
      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Fleet Overview</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {devices.length} devices
              {amberCount > 0 && (
                <span className="text-amber-600 mx-1">· {amberCount} testing</span>
              )}
              {failureCount > 0 && (
                <span className="text-red-600 mx-1">· {failureCount} fault{failureCount !== 1 ? "s" : ""}</span>
              )}
              {lastRefresh && (
                <span className="text-slate-400 ml-1">· {lastRefresh.toLocaleTimeString()}</span>
              )}
              {simulatorRunning === false && (
                <span className="text-slate-400 ml-1">· polling paused</span>
              )}
            </p>
          </div>
        </div>

        {/* Device Grid */}
        <div id="device-grid" className="mb-4">
          {loading ? (
            <div className="text-slate-400 text-sm">Connecting to Atlas…</div>
          ) : (
            <DeviceGrid
              devices={devices}
              liveStates={liveStates}
              pulses={pulses}
              onDeviceClick={openDrawer}
              onDeviceAction={handleDeviceAction}
            />
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 text-xs text-slate-500 mb-6">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Healthy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 amber-blink inline-block" /> Testing
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block" /> Failure
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" /> Offline
          </span>
          <span className="text-slate-400">· Right-click a device for actions</span>
        </div>

        {/* Scenario Controls (collapsible) */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setDemoOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
          >
            <span className="text-sm font-medium text-slate-700">Scenario Controls</span>
            <span className="text-slate-400 text-xs">{demoOpen ? "▾ hide" : "▸ show"}</span>
          </button>
          {demoOpen && (
            <div className="border-t border-slate-200 bg-white px-4 pb-4">
              <DemoControls onAction={refreshAll} />
            </div>
          )}
        </div>

        {/* Live Event Feed (collapsible) */}
        <div className="border border-slate-200 rounded-lg overflow-hidden mt-3">
          <button
            onClick={() => setLiveFeedOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
              Live Event Feed
              <span className="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style={{ background: "#009999" }} />
            </span>
            <span className="text-slate-400 text-xs">{liveFeedOpen ? "▾ hide" : "▸ show"}</span>
          </button>
          {liveFeedOpen && (
            <div style={{ height: 300 }}>
              <LiveFeed />
            </div>
          )}
        </div>
      </main>
      <RuntimeDebugPanel
        title="Fleet Runtime"
        metrics={{
          devices: devices.length,
          live_states: Object.keys(liveStates).length,
          pulses: Object.keys(pulses).length,
          drawer_open: drawerDeviceId ? 1 : 0,
          simulator_running: simulatorRunning === null ? "unknown" : simulatorRunning ? 1 : 0,
        }}
      />

      {/* Device Drawer */}
      {drawerDeviceId && (
        <DeviceDrawer
          deviceId={drawerDeviceId}
          ledState={liveStates[drawerDeviceId] ?? "green"}
          data={drawerData}
          onClose={() => setDrawerDeviceId(null)}
          onAction={(action) => handleDeviceAction(drawerDeviceId, action)}
          rerunning={rerunningDeviceId === drawerDeviceId}
          isolating={isolatingDeviceId === drawerDeviceId}
        />
      )}
    </div>
  );
}
