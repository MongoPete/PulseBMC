"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import LedIndicator from "@/components/LedIndicator";
import type { LedState } from "@/components/LedIndicator";
import TelemetryChart from "@/components/TelemetryChart";
import QueryTooltip from "@/components/QueryTooltip";
import { api, SSE_URL } from "@/lib/api";
import { fmtTime, fmtDateTime } from "@/lib/time";

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
  failureMode?: string;
  trueFaultSource?: string;
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
  const [device, setDevice] = useState<Record<string, unknown> | null>(null);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [queryInfo, setQueryInfo] = useState<Record<string, unknown> | null>(null);
  const [ledState, setLedState] = useState<LedState>("green");
  const [sseConnected, setSseConnected] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [rawDataOpen, setRawDataOpen] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);

  useEffect(() => {
    api.device(id as string).then(setDevice).catch(() => {});
    api.testRuns(id as string, 60).then((res) => {
      setRuns(res.data ?? []);
      setQueryInfo(res.query_info ?? null);
      const latest = res.data?.[0];
      if (latest?.led_state) setLedState(latest.led_state);
    });
  }, [id]);

  useEffect(() => {
    const es = new EventSource(SSE_URL);
    es.onopen = () => setSseConnected(true);
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.device_id === id && payload.led_state) {
        setLedState(payload.led_state);
        api.testRuns(id as string, 60).then((res) => setRuns(res.data ?? []));
      }
    };
    es.onerror = () => setSseConnected(false);
    return () => es.close();
  }, [id]);

  const latestRun = runs[0];
  const components = latestRun?.results?.components ?? [];
  const failingComponents = components.filter((c) => c.result === "fail");
  const location = device?.location as { datacenter?: string; rack?: string; slot?: string } | undefined;

  const isSticky = latestRun?.failure_mode === "sticky";

  return (
    <main className="max-w-7xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-400 mb-4">
        <Link href="/" className="hover:text-slate-700">Fleet</Link>
        <span>/</span>
        <span className="text-slate-700">{id}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <LedIndicator state={ledState} size="lg" />
          <div>
            <h1 className="text-xl font-bold text-slate-800">{id}</h1>
            {device && (
              <>
                <p className="text-sm text-slate-500">
                  {(device.hostname as string) ?? ""}
                  {location && (
                    <span className="font-mono ml-2 text-slate-400">
                      {[location.datacenter, location.rack, location.slot].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </p>
              </>
            )}
          </div>
        </div>
        <div id="sse-badge" className="flex items-center gap-2 text-xs">
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${
            sseConnected
              ? "border-green-200 text-green-700 bg-green-50"
              : "border-slate-200 text-slate-500 bg-white"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${sseConnected ? "bg-green-500 animate-pulse" : "bg-slate-300"}`} />
            {sseConnected ? "Live" : "Connecting…"}
          </span>
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
                <p className="text-[11px] text-slate-400 mt-0.5">row = PCIe component · cell = CPU core</p>
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
                {components.map((comp, rowIdx) => {
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
                            CORRUPT {comp.corruption_crc}
                          </span>
                        )}
                      </div>
                      {/* Core cells */}
                      <div className="flex gap-2 pl-4">
                        {cores.map((core, coreIdx) => {
                          const coreFailed = core.result === "fail";
                          const isLatched = coreFailed && isSticky;
                          const isCorrupted = !coreFailed && comp.corruption_detected && coreIdx === 0;
                          const isScanning = ledState === "amber" && !coreFailed && !isCorrupted;
                          const delay = `${(rowIdx * cores.length + coreIdx) * 110}ms`;

                          // Container background
                          let containerCls = "bg-slate-50 border-slate-200";
                          if (isLatched) containerCls = "bg-red-100 border-red-300";
                          else if (coreFailed) containerCls = "bg-red-50 border-red-200";
                          else if (isCorrupted) containerCls = "bg-amber-50 border-amber-200";

                          // Status dot color
                          let dotCls = "bg-green-500";
                          if (isScanning) dotCls = "bg-amber-400";
                          else if (isLatched) dotCls = "bg-red-700";
                          else if (coreFailed) dotCls = "bg-red-500";
                          else if (isCorrupted) dotCls = "bg-amber-400";

                          const hovered: HoveredCell = {
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
                            failureMode: latestRun?.failure_mode,
                            trueFaultSource: latestRun?.true_fault_source,
                          };

                          return (
                            <div
                              key={core.core_id}
                              className={`relative w-11 h-11 rounded border cursor-default flex flex-col items-center justify-center gap-0.5 transition-colors ${containerCls}`}
                              onMouseEnter={() => setHoveredCell(hovered)}
                              onMouseLeave={() => setHoveredCell(null)}
                            >
                              <div
                                className={`w-3 h-3 rounded-full ${dotCls} ${isScanning ? "animate-pulse" : ""}`}
                                style={isScanning ? { animationDelay: delay } : undefined}
                              />
                              <span className="text-[9px] text-slate-400 leading-none font-mono">{coreIdx}</span>
                              {isLatched && (
                                <span className="absolute top-0.5 right-1 text-[8px] text-red-700 font-bold leading-none">L</span>
                              )}
                              {isCorrupted && (
                                <span className="absolute top-0.5 right-1 text-[8px] text-amber-600 font-bold leading-none">~</span>
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

            {/* Hover diagnostics strip */}
            <div className="mt-4 min-h-[28px] flex items-center">
              {hoveredCell ? (
                <div className="px-3 py-1.5 bg-slate-100 rounded text-[11px] font-mono flex flex-wrap gap-x-3 gap-y-0.5 text-slate-600 w-full">
                  <span className="text-slate-500">{hoveredCell.componentId}</span>
                  <span className="text-slate-300">·</span>
                  <span>{hoveredCell.coreId}</span>
                  <span className="text-slate-300">·</span>
                  <span className={hoveredCell.coreResult === "fail" ? "text-red-600 font-semibold" : "text-green-600"}>
                    {hoveredCell.coreResult.toUpperCase()}
                  </span>
                  {hoveredCell.temp != null && (
                    <><span className="text-slate-300">·</span><span>{hoveredCell.temp}°C</span></>
                  )}
                  {hoveredCell.latencyMs != null && (
                    <><span className="text-slate-300">·</span><span>{hoveredCell.latencyMs}ms</span></>
                  )}
                  {hoveredCell.errorCode && hoveredCell.coreResult === "fail" && (
                    <><span className="text-slate-300">·</span><span className="text-red-500">{hoveredCell.errorCode}</span></>
                  )}
                  {hoveredCell.isLatched && (
                    <><span className="text-slate-300">·</span><span className="text-red-700">latched</span></>
                  )}
                  {hoveredCell.corruptionDetected && (
                    <><span className="text-slate-300">·</span><span className="text-amber-600">corrupt {hoveredCell.corruptionCrc}</span></>
                  )}
                  {hoveredCell.trueFaultSource && hoveredCell.coreResult === "fail" && (
                    <><span className="text-slate-300">·</span><span className="text-amber-600 text-[10px]">⚠ upstream: {hoveredCell.trueFaultSource}</span></>
                  )}
                </div>
              ) : (
                <span className="text-[11px] text-slate-400 pl-1">Hover a cell for diagnostics</span>
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center flex-wrap gap-x-5 gap-y-1 mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-green-500 inline-block" /> Pass</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Testing</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Fail</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-700 inline-block" /> Latched (L)</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400 inline-block" /> Corrupted (~)</span>
              {latestRun?.failure_mode && (
                <span className="ml-auto text-amber-600 font-medium capitalize">{latestRun.failure_mode} mode</span>
              )}
            </div>
          </div>

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
                    <pre className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded p-3 mt-1 overflow-auto max-h-48">
                      {JSON.stringify(run, null, 2)}
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
                        ["Temperature", `${latestRun.nvme_smart.temperature}°C`],
                        ["Media Errors", latestRun.nvme_smart.media_errors],
                        ["Err Log Entries", latestRun.nvme_smart.num_err_log_entries],
                        ["Power-on Hours", latestRun.nvme_smart.power_on_hours.toLocaleString()],
                        ["Unsafe Shutdowns", latestRun.nvme_smart.unsafe_shutdowns],
                        ["Available Spare", `${latestRun.nvme_smart.available_spare}%`],
                        ["% Used", `${latestRun.nvme_smart.percentage_used}%`],
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
                            <span className="text-slate-400">#{e.error_count}</span>
                            <span>{e.description}</span>
                            <span className="text-slate-400 ml-auto">0x{e.status_field.toString(16).padStart(2, "0")}</span>
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
              <button
                onClick={() => setRawDataOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <span className="font-medium">Raw MongoDB Document</span>
                <span className="text-slate-400">{rawDataOpen ? "▾ hide" : "▸ show"}</span>
              </button>
              {rawDataOpen && (
                <div id="doc-viewer" className="border-t border-slate-100">
                  <pre className="text-xs text-slate-600 bg-slate-50 p-4 overflow-auto max-h-96">
                    {JSON.stringify(latestRun, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
