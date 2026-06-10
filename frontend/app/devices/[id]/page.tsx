"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import LedIndicator from "@/components/LedIndicator";
import type { LedState } from "@/components/LedIndicator";
import TelemetryChart from "@/components/TelemetryChart";
import ThermalTrendChart from "@/components/ThermalTrendChart";
import QueryTooltip from "@/components/QueryTooltip";
import RuntimeDebugPanel from "@/components/RuntimeDebugPanel";
import { api } from "@/lib/api";
import { fmtTime, fmtDateTime, fmtRelative } from "@/lib/time";
import { JsonLight } from "@/components/SyntaxHighlight";
import DocumentViewer from "@/components/DocumentViewer";
import ConceptBar from "@/components/ConceptBar";
import PageShell, { PageMain } from "@/components/PageShell";
import ChangeStreamLiveLabel from "@/components/ChangeStreamLiveLabel";
import { trackedInterval, trackedTimeout } from "@/lib/runtimeDebug";
import { subscribeLiveMessages, subscribeLiveStatus } from "@/lib/liveStream";

const DATE_FIELDS = new Set(["last_seen", "registered_at", "created_at", "updated_at", "started_at", "completed_at"]);

interface CoreResult {
  core_id: string;
  result: string;
  temp_c?: number;
  latency_ms?: number;
}

interface ComponentResult {
  component_id: string;
  result: string;
  error_code?: string;
  corruption_detected?: boolean;
  corruption_crc?: string;
  core_results?: CoreResult[];
}

interface LatchedFailure {
  component_id: string;
  core_id: string;
  error_code?: string;
  run_id?: string;
  latched_at: string;
}

interface HoveredCell {
  componentId: string;
  compResult: string;
  errorCode?: string;
  corruptionDetected?: boolean;
  corruptionCrc?: string;
  coreId: string;
  coreIndex: number;
  coreResult: string;
  temp?: number;
  latencyMs?: number;
  isLatched: boolean;
  isLatchedPass: boolean;
  latchInfo?: LatchedFailure;
  failureMode?: string;
  trueFaultSource?: string;
  runId?: string;
  runStartedAt?: string;
  runDurationMs?: number;
}

interface TestRun {
  id: string;
  started_at: string;
  status: string;
  led_state: LedState;
  duration_ms: number;
  results: {
    overall: string;
    components: ComponentResult[];
  };
  failure_mode?: string;
  true_fault_source?: string;
  nvme_smart?: {
    critical_warning: number;
    temperature: number;
    available_spare: number;
    percentage_used: number;
    power_on_hours: number;
    unsafe_shutdowns: number;
    media_errors: number;
    num_err_log_entries: number;
  };
  nvme_errors?: Array<{ error_count: number; description: string; status_field: number }>;
}

function MetaValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
  if (typeof value === "object" && !Array.isArray(value)) {
    return (
      <div className="space-y-0.5 text-right">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex justify-end gap-1.5">
            <span className="text-slate-400">{k}:</span>
            <span className="text-slate-700">{String(v)}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <span className="text-slate-700 truncate max-w-[200px] block" title={String(value)}>
      {String(value)}
    </span>
  );
}

export default function DevicePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [rerunning, setRerunning] = useState(false);
  const [latching, setLatching] = useState(false);
  const [device, setDevice] = useState<Record<string, unknown> | null>(null);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [queryInfo, setQueryInfo] = useState<Record<string, unknown> | null>(null);
  const [thermalReadings, setThermalReadings] = useState<Array<{ ts: string; readings: Record<string, unknown> }>>([]);
  const [thermalQueryInfo, setThermalQueryInfo] = useState<Record<string, unknown> | null>(null);
  const [ledState, setLedState] = useState<LedState>("green");
  const [sseConnected, setSseConnected] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [smartOpen, setSmartOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<HoveredCell | null>(null);
  const [sweepIdx, setSweepIdx] = useState(0);
  const sweepRef = useRef<(() => void) | null>(null);
  const rerunResetTimerRef = useRef<(() => void) | null>(null);
  const runRefreshInFlightRef = useRef(false);

  useEffect(() => {
    return () => {
      if (rerunResetTimerRef.current) rerunResetTimerRef.current();
    };
  }, []);

  const refreshRunAndTelemetry = useCallback(async () => {
    if (runRefreshInFlightRef.current) return;
    runRefreshInFlightRef.current = true;
    try {
      const [runsRes, telemetryRes] = await Promise.all([
        api.testRuns(id as string, 60),
        api.telemetry(id as string, 60),
      ]);
      setRuns(runsRes.data ?? []);
      setThermalReadings(telemetryRes.data ?? []);
    } finally {
      runRefreshInFlightRef.current = false;
    }
  }, [id]);

  useEffect(() => {
    api.device(id as string).then(setDevice).catch(() => {});
    api.testRuns(id as string, 60).then((res) => {
      setRuns(res.data ?? []);
      setQueryInfo(res.query_info ?? null);
      const latest = res.data?.[0];
      if (latest?.led_state) setLedState(latest.led_state);
    });
    api.telemetry(id as string, 60).then((res) => {
      setThermalReadings(res.data ?? []);
      setThermalQueryInfo(res.query_info ?? null);
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    const unsubStatus = subscribeLiveStatus(setSseConnected);
    const unsubMsg = subscribeLiveMessages((payload) => {
      if (payload.device_id === id && payload.led_state) {
        setLedState(payload.led_state as LedState);
        refreshRunAndTelemetry().catch(() => {});
      }
    });
    return () => {
      unsubStatus();
      unsubMsg();
    };
  }, [id, refreshRunAndTelemetry]);

  // Single-core sweep: one cell at a time pulses amber while testing
  useEffect(() => {
    if (ledState === "amber") {
      if (sweepRef.current) sweepRef.current();
      const i = trackedInterval(() => setSweepIdx((n) => n + 1), 420);
      sweepRef.current = i.clear;
    } else {
      if (sweepRef.current) sweepRef.current();
      setSweepIdx(0);
    }
    return () => { if (sweepRef.current) sweepRef.current(); };
  }, [ledState]);

  const latestRun = runs[0];
  const components = latestRun?.results?.components ?? [];
  const failingComponents = components.filter((c) => c.result === "fail");
  const location = device?.location as { datacenter?: string; rack?: string; slot?: string } | undefined;
  const hw = device?.hardware as { model?: string; pcie_slots?: number } | undefined;

  const isSticky = latestRun?.failure_mode === "sticky";
  const latchedFailures: LatchedFailure[] = (device?.latched_failures as LatchedFailure[] | undefined) ?? [];

  // Pre-compute which [compIdx, coreIdx] is the active sweep cell
  const sweepCell = useMemo(() => {
    if (ledState !== "amber" || components.length === 0) return null;
    const passCells: [number, number][] = [];
    components.forEach((comp, ci) => {
      const compFailed = comp.result === "fail";
      const cores: CoreResult[] = comp.core_results?.length
        ? comp.core_results
        : Array.from({ length: 4 }, (_, i) => ({ core_id: `core_${i}`, result: compFailed ? "fail" : "pass" }));
      cores.forEach((core, ki) => {
        const isCorrupted = core.result !== "fail" && comp.corruption_detected && ki === 0;
        if (core.result !== "fail" && !isCorrupted) passCells.push([ci, ki]);
      });
    });
    if (passCells.length === 0) return null;
    return passCells[sweepIdx % passCells.length];
  }, [ledState, sweepIdx, components]);

  return (
    <PageShell>
      <ConceptBar />
      <PageMain maxWidth="wide">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
        <Link href="/" className="hover:text-slate-700">Fleet</Link>
        <span>/</span>
        <span className="text-slate-700">{id}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-start gap-3">
          <div className="mt-1">
            <LedIndicator state={ledState} size="md" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-semibold text-slate-800">{id}</h1>
              {device && <span className="text-sm text-slate-400">{(device.hostname as string) ?? ""}</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400 font-mono flex-wrap">
              {location && (
                <span>{[location.datacenter, location.rack, location.slot ? `Slot ${location.slot}` : null].filter(Boolean).join(" · ")}</span>
              )}
              {hw?.model && <span className="text-slate-300">·</span>}
              {hw?.model && <span>{hw.model}</span>}
              {hw?.pcie_slots && <span className="text-slate-300">·</span>}
              {hw?.pcie_slots && <span>{hw.pcie_slots} PCIe slots</span>}
            </div>
          </div>
        </div>
        <div id="sse-badge" className="flex items-center gap-2 text-xs">
          <ChangeStreamLiveLabel connected={sseConnected} compact />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">

          {/* Core Health Grid */}
          <div id="core-grid" className="bg-white border border-slate-200 rounded-lg p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Core Health Grid</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {components.length > 0
                    ? `${components.length} PCIe component${components.length !== 1 ? "s" : ""} · ${components.reduce((n, c) => n + (c.core_results?.length ?? 4), 0)} cores · click a cell to inspect`
                    : "row = PCIe component · cell = CPU core"}
                </p>
              </div>
              {latestRun?.true_fault_source && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded text-[11px] text-amber-700 max-w-[220px]">
                  <span className="shrink-0">⚠</span>
                  <span>Upstream suspect: <span className="font-mono">{latestRun.true_fault_source}</span></span>
                </div>
              )}
            </div>

            {/* Failing components banner */}
            {failingComponents.length > 0 && (
              <div className="mb-4 px-3 py-2 rounded bg-red-50 border border-red-200 text-xs text-red-700 flex flex-wrap gap-x-3">
                <span className="font-semibold">Failing:</span>
                {failingComponents.map((c) => (
                  <span key={c.component_id} className="font-mono">
                    {c.component_id}{c.error_code ? ` (${c.error_code})` : ""}
                  </span>
                ))}
              </div>
            )}

            {/* Component rows */}
            {components.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No test run data yet</p>
            ) : (
              <div className="space-y-4">
                {components.map((comp, compIdx) => {
                  const compFailed = comp.result === "fail";
                  const cores: CoreResult[] = comp.core_results?.length
                    ? comp.core_results
                    : Array.from({ length: 4 }, (_, i) => ({
                        core_id: `core_${i}`,
                        result: compFailed ? "fail" : "pass",
                      }));

                  return (
                    <div key={comp.component_id}>
                      {/* Row label */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${compFailed ? "bg-red-500" : "bg-green-500"}`} />
                        <span className="text-[11px] font-mono text-slate-600 font-medium">{comp.component_id}</span>
                        {comp.error_code && compFailed && (
                          <span className="text-[10px] text-red-500 font-mono bg-red-50 px-1.5 py-0.5 rounded">{comp.error_code}</span>
                        )}
                        {comp.corruption_detected && (
                          <span className="text-[10px] text-amber-600 font-mono bg-amber-50 px-1.5 py-0.5 rounded">
                            corrupt {comp.corruption_crc}
                          </span>
                        )}
                      </div>
                      {/* Core cells */}
                      <div className="flex gap-2 pl-4">
                        {cores.map((core, coreIdx) => {
                          const coreFailed = core.result === "fail";
                          const isLatched = coreFailed && isSticky;
                          const isCorrupted = !coreFailed && comp.corruption_detected && coreIdx === 0;
                          const isSweeping = sweepCell !== null && sweepCell[0] === compIdx && sweepCell[1] === coreIdx;

                          // Check if this cell has an uncleared manual latch from the device doc
                          const latchInfo = latchedFailures.find(
                            (l) => l.component_id === comp.component_id && l.core_id === core.core_id
                          );
                          // latched-pass: has a latch but current test passed — the "almost missed it" state
                          const isLatchedPass = !!latchInfo && !coreFailed;

                          let containerCls = "bg-slate-50 border-slate-200 hover:border-slate-300";
                          if (isLatched) containerCls = "bg-red-50 border-red-200 border-l-[3px] border-l-red-700 hover:bg-red-100";
                          else if (coreFailed) containerCls = "bg-red-50 border-red-200 hover:bg-red-100";
                          else if (isLatchedPass) containerCls = "bg-amber-50 border-amber-300 hover:bg-amber-100";
                          else if (isCorrupted) containerCls = "bg-amber-50 border-amber-200 hover:bg-amber-100";
                          else if (isSweeping) containerCls = "bg-amber-50 border-amber-300";

                          let dotCls = "bg-green-500";
                          if (isSweeping) dotCls = "bg-amber-400 amber-blink";
                          else if (isLatched) dotCls = "bg-red-800";
                          else if (coreFailed) dotCls = "bg-red-500";
                          else if (isLatchedPass) dotCls = "bg-green-500";  // passing now
                          else if (isCorrupted) dotCls = "bg-amber-400";

                          const isSelected =
                            selectedCell?.componentId === comp.component_id &&
                            selectedCell?.coreIndex === coreIdx;

                          const cellData: HoveredCell = {
                            componentId: comp.component_id,
                            compResult: comp.result,
                            errorCode: comp.error_code,
                            corruptionDetected: comp.corruption_detected,
                            corruptionCrc: comp.corruption_crc,
                            coreId: core.core_id,
                            coreIndex: coreIdx,
                            coreResult: core.result,
                            temp: core.temp_c,
                            latencyMs: core.latency_ms,
                            isLatched,
                            isLatchedPass,
                            latchInfo,
                            failureMode: latestRun?.failure_mode,
                            trueFaultSource: latestRun?.true_fault_source,
                            runId: latestRun?.id,
                            runStartedAt: latestRun?.started_at,
                            runDurationMs: latestRun?.duration_ms,
                          };

                          return (
                            <div
                              key={core.core_id}
                              className={`relative w-11 h-11 rounded border cursor-pointer flex flex-col items-center justify-center gap-0.5 transition-colors ${containerCls} ${isSelected ? "ring-2 ring-offset-1 ring-slate-400" : ""}`}
                              onClick={() => setSelectedCell(isSelected ? null : cellData)}
                            >
                              <div className={`w-3 h-3 rounded-full ${dotCls}`} />
                              <span className="text-[9px] text-slate-400 leading-none font-mono">{coreIdx}</span>
                              {isLatched && (
                                <span className="absolute top-0.5 right-0.5 text-[7px] text-red-800 font-bold leading-none">L</span>
                              )}
                              {isLatchedPass && (
                                <span className="absolute top-0.5 right-0.5 text-[7px] text-amber-600 font-bold leading-none">⚑</span>
                              )}
                              {isCorrupted && !isLatchedPass && (
                                <span className="absolute top-0.5 right-0.5 text-[7px] text-amber-600 font-bold leading-none">~</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Selected cell inspection panel */}
            <div className="mt-4 border-t border-slate-100 pt-3">
              {selectedCell ? (
                <div className="rounded border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="space-y-1.5 text-xs font-mono">

                      {/* Identity */}
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 w-20 shrink-0">component</span>
                        <span className="text-slate-700 font-semibold">{selectedCell.componentId}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 w-20 shrink-0">core</span>
                        <span className="text-slate-700">{selectedCell.coreId}</span>
                      </div>

                      {/* Result — with failure mode context */}
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 w-20 shrink-0">result</span>
                        <span className={selectedCell.coreResult === "fail" ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
                          {selectedCell.coreResult.toUpperCase()}
                        </span>
                        {selectedCell.isLatched && <span className="text-red-700 text-[10px] bg-red-100 px-1.5 py-0.5 rounded">latched</span>}
                        {selectedCell.isLatchedPass && <span className="text-amber-700 text-[10px] bg-amber-100 px-1.5 py-0.5 rounded">⚑ latch pending</span>}
                        {selectedCell.failureMode && selectedCell.failureMode !== "none" && (
                          <span className="text-slate-500 text-[10px] capitalize">{selectedCell.failureMode}</span>
                        )}
                      </div>

                      {/* Test timestamp + duration — Aaron's ask: "timestamp of last result" */}
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 w-20 shrink-0">last test</span>
                        <span className="text-slate-700" title={fmtDateTime(selectedCell.runStartedAt)}>
                          {fmtRelative(selectedCell.runStartedAt)}
                        </span>
                        {selectedCell.runDurationMs != null && (
                          <span className="text-slate-400">{selectedCell.runDurationMs}ms</span>
                        )}
                      </div>

                      {/* Temperature */}
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 w-20 shrink-0">temperature</span>
                        {selectedCell.temp != null ? (
                          <span className={selectedCell.temp > 70 ? "text-amber-600 font-semibold" : "text-slate-700"}>
                            {selectedCell.temp}°C{selectedCell.temp > 70 ? " ▲" : ""}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </div>

                      {/* Latency */}
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 w-20 shrink-0">latency</span>
                        {selectedCell.latencyMs != null ? (
                          <span className="text-slate-700">{selectedCell.latencyMs}ms</span>
                        ) : <span className="text-slate-300">—</span>}
                      </div>

                      {/* Error code */}
                      {selectedCell.errorCode && (
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 w-20 shrink-0">error</span>
                          <span className="text-red-600 font-semibold">{selectedCell.errorCode}</span>
                        </div>
                      )}

                      {/* Upstream fault source */}
                      {selectedCell.trueFaultSource && selectedCell.coreResult === "fail" && (
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 w-20 shrink-0">upstream</span>
                          <span className="text-amber-700">⚠ {selectedCell.trueFaultSource}</span>
                        </div>
                      )}

                      {/* Latch timestamp — use safe fmtTime, not raw new Date() */}
                      {selectedCell.latchInfo && (
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 w-20 shrink-0">latched at</span>
                          <span className="text-amber-700">
                            {fmtTime(selectedCell.latchInfo.latched_at)}
                            {selectedCell.latchInfo.error_code && (
                              <span className="ml-1.5 text-slate-500">{selectedCell.latchInfo.error_code}</span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        disabled={rerunning}
                        onClick={async () => {
                          setRerunning(true);
                          try { await api.demo.rerun(id); }
                          catch { /* ignore */ }
                          finally {
                            if (rerunResetTimerRef.current) rerunResetTimerRef.current();
                            const t = trackedTimeout(() => setRerunning(false), 2000);
                            rerunResetTimerRef.current = t.clear;
                          }
                        }}
                        className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {rerunning ? "Running…" : "Rerun Test"}
                      </button>
                      {/* Latch / Clear latch */}
                      {selectedCell.latchInfo ? (
                        <button
                          disabled={latching}
                          onClick={async () => {
                            setLatching(true);
                            try {
                              await api.clearLatch(id, selectedCell.componentId, selectedCell.coreId);
                              const d = await api.device(id);
                              setDevice(d as Record<string, unknown>);
                              setSelectedCell(null);
                            } catch { /* ignore */ }
                            finally { setLatching(false); }
                          }}
                          className="text-xs px-3 py-1.5 rounded border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50"
                        >
                          {latching ? "Clearing…" : "Clear Latch"}
                        </button>
                      ) : selectedCell.coreResult === "fail" ? (
                        <button
                          disabled={latching}
                          onClick={async () => {
                            setLatching(true);
                            try {
                              await api.latchCore(id, selectedCell.componentId, selectedCell.coreId, selectedCell.errorCode, selectedCell.runId);
                              const d = await api.device(id);
                              setDevice(d as Record<string, unknown>);
                            } catch { /* ignore */ }
                            finally { setLatching(false); }
                          }}
                          className="text-xs px-3 py-1.5 rounded border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
                        >
                          {latching ? "Latching…" : "Latch Failure"}
                        </button>
                      ) : null}
                      <button
                        onClick={() => router.push("/alerts")}
                        className="text-xs px-3 py-1.5 rounded border border-slate-200 text-slate-500 hover:bg-white transition-colors"
                      >
                        View Alerts
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <span className="text-[11px] text-slate-400">Click a cell to inspect</span>
              )}
            </div>

            {/* Legend — sticky hardware vs operator latch vs transient */}
            <div className="flex items-center flex-wrap gap-x-5 gap-y-1 mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Pass</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 amber-blink inline-block" /> Testing (sweep)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 failure-pulse inline-block" /> Transient fail</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-800 border-l-2 border-red-700 inline-block rounded-sm" /> Sticky fail (sim latches red)</span>
              <span className="flex items-center gap-1.5">
                <span className="relative w-2.5 h-2.5 inline-block">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />
                  <span className="absolute -top-0.5 -right-1 text-[6px] text-amber-600 font-bold">⚑</span>
                </span>
                <span className="ml-1">Latched pass — operator pinned prior fail</span>
              </span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Corrupt (silent mode)</span>
              {latestRun?.failure_mode && (
                <span className="ml-auto text-amber-600 font-medium capitalize">{latestRun.failure_mode} mode</span>
              )}
            </div>
          </div>

          {/* Thermal Trend — time-series collection, pre-warming signal */}
          {thermalReadings.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <ThermalTrendChart
                readings={thermalReadings as Parameters<typeof ThermalTrendChart>[0]["readings"]}
                queryInfo={thermalQueryInfo ?? undefined}
              />
            </div>
          )}

          {/* Telemetry Chart */}
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <TelemetryChart runs={runs} queryInfo={queryInfo ?? undefined} />
          </div>

          {/* Recent Test Runs */}
          <div id="test-run-history" className="bg-white border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-700">Recent Test Runs</h2>
              {queryInfo && (
                <QueryTooltip queryInfo={queryInfo as Parameters<typeof QueryTooltip>[0]["queryInfo"]} label="query" />
              )}
            </div>
            <div className="space-y-1">
              {runs.slice(0, 10).map((run) => (
                <div key={run.id}>
                  <button
                    onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                    className="w-full flex items-center gap-3 text-xs text-left hover:bg-slate-50 rounded px-2 py-1.5 transition-colors"
                  >
                    <LedIndicator state={run.led_state} size="sm" />
                    <span className="text-slate-500 w-24 shrink-0">{fmtTime(run.started_at)}</span>
                    <span className={`w-10 shrink-0 font-semibold ${run.status === "fail" ? "text-red-600" : "text-green-600"}`}>
                      {run.status.toUpperCase()}
                    </span>
                    <span className="text-slate-400">{run.duration_ms} ms</span>
                    {run.results?.components?.filter((c) => c.result === "fail").map((c) => (
                      <span key={c.component_id} className="text-red-500 font-mono">{c.component_id}</span>
                    ))}
                    {run.failure_mode && (
                      <span className="text-amber-500 text-[10px] capitalize">{run.failure_mode}</span>
                    )}
                    <span className="text-slate-400 ml-auto">{expandedRun === run.id ? "▾" : "▸"} JSON</span>
                  </button>
                  {expandedRun === run.id && (
                    <pre className="text-xs bg-slate-50 border border-slate-100 rounded p-3 mt-1 overflow-auto max-h-48 font-mono leading-relaxed">
                      <JsonLight code={JSON.stringify(run, null, 2)} />
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Device metadata */}
          {device && (
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Device Metadata</h3>
              <div className="space-y-2.5 text-xs">
                {Object.entries(device)
                  .filter(([k]) => !["id", "embedding", "_id"].includes(k))
                  .map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-3">
                      <span className="text-slate-500 font-mono shrink-0">{k}</span>
                      {DATE_FIELDS.has(k) && typeof v === "string" ? (
                        <span className="text-slate-700 text-right" title={String(v)}>{fmtDateTime(v)}</span>
                      ) : (
                        <MetaValue value={v} />
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* NVMe SMART Data */}
          {latestRun?.nvme_smart && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setSmartOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">NVMe SMART Data</span>
                  {latestRun.nvme_smart.media_errors > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">
                      {latestRun.nvme_smart.media_errors} media error{latestRun.nvme_smart.media_errors !== 1 ? "s" : ""}
                    </span>
                  )}
                  {latestRun.nvme_smart.critical_warning > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-medium">critical</span>
                  )}
                </div>
                <span className="text-slate-400">{smartOpen ? "▾ hide" : "▸ show"}</span>
              </button>
              {smartOpen && (
                <div className="border-t border-slate-100 p-4">
                  <table className="w-full text-xs">
                    <tbody className="divide-y divide-slate-50">
                      {[
                        ["Temperature", latestRun.nvme_smart.temperature != null ? `${latestRun.nvme_smart.temperature}°C` : "—"],
                        ["Media Errors", latestRun.nvme_smart.media_errors ?? "—"],
                        ["Err Log Entries", latestRun.nvme_smart.num_err_log_entries ?? "—"],
                        ["Power-on Hours", latestRun.nvme_smart.power_on_hours != null ? latestRun.nvme_smart.power_on_hours.toLocaleString() : "—"],
                        ["Unsafe Shutdowns", latestRun.nvme_smart.unsafe_shutdowns ?? "—"],
                        ["Available Spare", latestRun.nvme_smart.available_spare != null ? `${latestRun.nvme_smart.available_spare}%` : "—"],
                        ["% Used", latestRun.nvme_smart.percentage_used != null ? `${latestRun.nvme_smart.percentage_used}%` : "—"],
                      ].map(([label, val]) => (
                        <tr key={String(label)}>
                          <td className="py-1.5 text-slate-500 font-mono">{label}</td>
                          <td className="py-1.5 text-slate-700 text-right font-mono">{val}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {latestRun.nvme_errors && latestRun.nvme_errors.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Error Log</p>
                      <div className="space-y-1">
                        {latestRun.nvme_errors.map((e, i) => (
                          <div key={i} className="text-[11px] text-slate-600 font-mono flex gap-2">
                            <span className="text-slate-400">#{e.error_count ?? i}</span>
                            <span>{e.description ?? "—"}</span>
                            {e.status_field != null && (
                              <span className="text-slate-400 ml-auto">0x{Number(e.status_field).toString(16).padStart(2, "0")}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Raw document (progressive disclosure) */}
          {latestRun && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <DocumentViewer doc={latestRun as unknown as Record<string, unknown>} title="Live test_run document (≈ SQL row + embedded JSON)" />
            </div>
          )}
        </div>
      </div>
      <RuntimeDebugPanel
        title="Device Runtime"
        metrics={{
          runs: runs.length,
          thermal_points: thermalReadings.length,
          selected_cell: selectedCell ? 1 : 0,
          sse_connected: sseConnected ? 1 : 0,
          rerunning: rerunning ? 1 : 0,
        }}
      />
      </PageMain>
    </PageShell>
  );
}
