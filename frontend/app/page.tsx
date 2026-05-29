"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import DeviceGrid from "@/components/DeviceGrid";
import DemoControls from "@/components/DemoControls";
import type { LedState } from "@/components/LedIndicator";
import LedIndicator from "@/components/LedIndicator";
import { api, SSE_URL } from "@/lib/api";
import { fmtRelative } from "@/lib/time";

interface Device {
  device_id: string;
  hostname: string;
  status: string;
  location?: { datacenter?: string; rack?: string; slot?: string };
}

interface DrawerData {
  device: Device | null;
  runs: Array<{
    id: string;
    started_at: string;
    status: string;
    led_state: LedState;
    duration_ms: number;
    results?: { components?: Array<{ component_id: string; result: string; error_code?: string }> };
  }>;
  loading: boolean;
}

// ── Device Drawer ──────────────────────────────────────────────────────────────

function DeviceDrawer({
  deviceId,
  ledState,
  data,
  onClose,
  onAction,
}: {
  deviceId: string;
  ledState: LedState;
  data: DrawerData;
  onClose: () => void;
  onAction: (action: "logs" | "analysis" | "rerun" | "isolate") => void;
}) {
  const { device, runs, loading } = data;
  const latestRun = runs[0];
  const components = latestRun?.results?.components ?? [];
  const failingComponents = components.filter((c) => c.result === "fail");

  // Simple 4×4 mini core grid (at most 4 components × 4 cores)
  const miniGrid = components.slice(0, 4).map((comp) =>
    [comp.result === "fail", comp.result === "fail", comp.result === "fail", comp.result === "fail"]
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30 bg-black/15 backdrop-blur-[1px]"
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className="fixed right-0 top-12 bottom-0 z-40 w-96 bg-white border-l shadow-xl flex flex-col"
        style={{ borderColor: "#e2e8f0" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b" style={{ borderColor: "#e2e8f0" }}>
          <div className="flex items-start gap-3">
            <LedIndicator state={ledState} size="lg" />
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
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-xl leading-none mt-0.5"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5 text-sm text-slate-400">Loading…</div>
          ) : (
            <>
              {/* Mini core health grid */}
              {components.length > 0 && (
                <div className="px-5 py-4 border-b" style={{ borderColor: "#f1f5f9" }}>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                    Component Health
                  </p>
                  {failingComponents.length > 0 && (
                    <div className="mb-2 px-2.5 py-1.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">
                      Failing: {failingComponents.map((c) => `${c.component_id}${c.error_code ? ` (${c.error_code})` : ""}`).join(", ")}
                    </div>
                  )}
                  <div className="space-y-1">
                    {components.map((comp) => (
                      <div key={comp.component_id} className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${comp.result === "fail" ? "bg-red-500" : "bg-green-400"}`} />
                        <span className="text-xs font-mono text-slate-600 flex-1 truncate">{comp.component_id}</span>
                        <span className={`text-[10px] font-medium ${comp.result === "fail" ? "text-red-600" : "text-green-600"}`}>
                          {comp.result.toUpperCase()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent runs */}
              <div className="px-5 py-4 border-b" style={{ borderColor: "#f1f5f9" }}>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                  Recent Tests
                </p>
                <div className="space-y-1">
                  {runs.slice(0, 6).map((run) => (
                    <div key={run.id} className="flex items-center gap-2 text-xs">
                      <LedIndicator state={run.led_state} size="sm" />
                      <span className={`w-8 font-medium shrink-0 ${run.status === "fail" ? "text-red-600" : "text-green-600"}`}>
                        {run.status.toUpperCase()}
                      </span>
                      <span className="text-slate-400 flex-1">{fmtRelative(run.started_at)}</span>
                      <span className="text-slate-400 font-mono">{run.duration_ms}ms</span>
                    </div>
                  ))}
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
              className="text-xs px-3 py-2 rounded-lg border font-medium transition-colors"
              style={{ borderColor: "#009999", color: "#009999" }}
            >
              Run Analysis
            </button>
            <button
              onClick={() => onAction("rerun")}
              className="text-xs px-3 py-2 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 transition-colors"
            >
              Rerun Test
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
            className="w-full text-xs px-3 py-2 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
          >
            Isolate Device
          </button>
        </div>
      </aside>
    </>
  );
}

// ── Fleet Page ─────────────────────────────────────────────────────────────────

export default function FleetPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [liveStates, setLiveStates] = useState<Record<string, LedState>>({});
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [demoOpen, setDemoOpen] = useState(false);

  // Drawer state
  const [drawerDeviceId, setDrawerDeviceId] = useState<string | null>(null);
  const [drawerData, setDrawerData] = useState<DrawerData>({ device: null, runs: [], loading: false });

  const refreshAll = useCallback(async () => {
    try {
      const [devRes, stateRes] = await Promise.all([
        api.devices(),
        api.fleetStates(),
      ]);
      setDevices(devRes.data ?? []);
      setLiveStates((prev) => ({ ...stateRes as Record<string, LedState>, ...prev }));
      setLastRefresh(new Date());
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 5000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  useEffect(() => {
    const es = new EventSource(SSE_URL);
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.device_id && payload.led_state) {
        setLiveStates((prev) => ({ ...prev, [payload.device_id]: payload.led_state as LedState }));
        if (payload.led_state !== "amber") {
          setPulses((prev) => ({ ...prev, [payload.device_id]: Date.now() }));
        }
      }
    };
    return () => es.close();
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
      window.open(`/devices/${deviceId}`, "_blank");
    } else if (action === "analysis") {
      window.location.href = `/alerts`;
    } else if (action === "rerun") {
      try {
        await api.demo.rerun(deviceId);
        // Re-fetch drawer data after rerun
        if (drawerDeviceId === deviceId) {
          setTimeout(() => openDrawer(deviceId), 1500);
        }
      } catch { /* ignore */ }
    } else if (action === "isolate") {
      try {
        const currentStatus = devices.find((d) => d.device_id === deviceId)?.status;
        const newStatus = currentStatus === "maintenance" ? "online" : "maintenance";
        await api.isolateDevice(deviceId, newStatus);
        await refreshAll();
        if (drawerDeviceId === deviceId) {
          openDrawer(deviceId);
        }
      } catch { /* ignore */ }
    }
  }, [devices, drawerDeviceId, openDrawer, refreshAll]);

  const failureCount = Object.values(liveStates).filter((s) => s === "red").length;
  const amberCount = Object.values(liveStates).filter((s) => s === "amber").length;

  return (
    <div>
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
                <span className="text-red-600 mx-1">· {failureCount} failure{failureCount !== 1 ? "s" : ""}</span>
              )}
              {lastRefresh && (
                <span className="text-slate-400 ml-1">· {lastRefresh.toLocaleTimeString()}</span>
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

        {/* Demo Controls (collapsible) */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setDemoOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors text-left"
          >
            <span className="text-sm font-medium text-slate-700">Demo Controls</span>
            <span className="text-slate-400 text-xs">{demoOpen ? "▾ hide" : "▸ show"}</span>
          </button>
          {demoOpen && (
            <div className="border-t border-slate-200 bg-white px-4 pb-4">
              <DemoControls onAction={refreshAll} />
            </div>
          )}
        </div>
      </main>

      {/* Device Drawer */}
      {drawerDeviceId && (
        <DeviceDrawer
          deviceId={drawerDeviceId}
          ledState={liveStates[drawerDeviceId] ?? "green"}
          data={drawerData}
          onClose={() => setDrawerDeviceId(null)}
          onAction={(action) => handleDeviceAction(drawerDeviceId, action)}
        />
      )}
    </div>
  );
}
