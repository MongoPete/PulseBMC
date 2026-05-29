"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ConceptBar from "@/components/ConceptBar";
import LedIndicator from "@/components/LedIndicator";
import TelemetryChart from "@/components/TelemetryChart";
import DocumentViewer from "@/components/DocumentViewer";
import QueryTooltip from "@/components/QueryTooltip";
import GuidedTour, { TourCard, WhyBox, Pill } from "@/components/GuidedTour";
import { api, SSE_URL } from "@/lib/api";
import { fmtTime, fmtDateTime } from "@/lib/time";
import type { Step } from "react-joyride";

const DATE_FIELDS = new Set(["last_seen", "registered_at", "created_at", "updated_at", "started_at", "completed_at"]);

type LedState = "green" | "flashing_green" | "red" | "off";

interface TestRun {
  id: string;
  started_at: string;
  status: string;
  led_state: LedState;
  duration_ms: number;
  results: { overall: string; components: Array<{ component_id: string; result: string; error_code?: string }> };
}

const DEVICE_TOUR_STEPS: Step[] = [
  {
    target: "#core-grid",
    title: "Core Health Grid — reading PCIe failures",
    content: (
      <TourCard>
        <p>
          This grid shows the health of every CPU core across all PCIe components on this device.
          Each <strong>row</strong> = one PCIe component. Each <strong>cell</strong> = one CPU core.
        </p>
        <p>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-red-500" /> Red row
          </span>
          {" "}= that component's loopback test failed. Every core in the row is marked red
          because the failure is at the component (card) level, not individual cores.
        </p>
        <p>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-400/60" /> Green row
          </span>
          {" "}= loopback passed within the 400 ms timeout.
        </p>
        <WhyBox>
          In SQL this would be a JOIN across 3 tables. Here it's one read of the embedded
          components array inside a single <Pill>test_runs</Pill> document.
        </WhyBox>
      </TourCard>
    ),
  },
  {
    target: "#sse-badge",
    title: "Live updates via Change Streams",
    content: (
      <TourCard>
        <p>
          This page listens to <strong>Atlas Change Streams</strong> — a real-time event feed
          that fires the moment a new test run document is written to the cluster.
        </p>
        <p>
          When the simulator writes a result for this device, the LED and grid update here
          in under a second. No polling, no refresh.
        </p>
        <p className="text-gray-300 text-xs">
          SQL equivalent: PostgreSQL <code>LISTEN/NOTIFY</code> or Debezium CDC on MySQL.
          Atlas Change Streams need zero extra infrastructure.
        </p>
        <WhyBox>
          Real-time hardware telemetry without Kafka, Redis, or a change-data-capture pipeline.
        </WhyBox>
      </TourCard>
    ),
  },
  {
    target: "#doc-viewer",
    title: "The raw MongoDB document",
    content: (
      <TourCard>
        <p>
          Click to expand — this is the exact document stored in Atlas for the latest test run.
          It contains the <em>overall result</em> and <em>every component result</em> nested inside it.
        </p>
        <p>
          In a relational database you'd split this across:
          a <code>test_runs</code> table, a <code>test_run_components</code> child table,
          and need a JOIN to read them together.
        </p>
        <p>
          The <span className="text-yellow-400 font-mono">embedding</span> field is a 1,024-number
          vector that enables semantic similarity search — no SQL equivalent.
        </p>
        <WhyBox>
          One document read. No JOIN. The query the dashboard uses is a single indexed
          <Pill>find</Pill> — sub-millisecond even at scale.
        </WhyBox>
      </TourCard>
    ),
  },
  {
    target: "#test-run-history",
    title: "Test run history — time-series in Atlas",
    content: (
      <TourCard>
        <p>
          Each row here is one <Pill>test_runs</Pill> document, returned by a{" "}
          <Pill>find</Pill> query sorted by <Pill>started_at</Pill> descending.
          Click any row to see the full JSON document.
        </p>
        <p>
          The chart above plots pass/fail trends over time using an aggregation pipeline —
          the same data, grouped by time bucket.
        </p>
        <p className="text-gray-300 text-xs">
          SQL: <code>SELECT * FROM test_runs WHERE device_id = ? ORDER BY started_at DESC LIMIT 60</code>
        </p>
        <WhyBox>
          Compound index on <code>(device_id, started_at)</code> means this query is O(log n)
          regardless of how many runs are in the collection.
        </WhyBox>
      </TourCard>
    ),
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function MetaValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  if (typeof value === "object" && !Array.isArray(value)) {
    return (
      <div className="space-y-0.5 text-right">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k} className="flex justify-end gap-1.5">
            <span className="text-gray-400">{k}:</span>
            <span className="text-gray-300">{String(v)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-gray-300 truncate max-w-[200px] block" title={String(value)}>{String(value)}</span>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DevicePage() {
  const { id } = useParams<{ id: string }>();
  const [device, setDevice] = useState<Record<string, unknown> | null>(null);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [queryInfo, setQueryInfo] = useState<Record<string, unknown> | null>(null);
  const [ledState, setLedState] = useState<LedState>("green");
  const [sseConnected, setSseConnected] = useState(false);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

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

  // Build 16×16 grid — each row = one component, each cell = one core
  const components = latestRun?.results?.components ?? [];
  const NUM_COMPONENTS = Math.max(components.length, 16);
  const coreGrid: Array<{ state: LedState; componentId: string; errorCode?: string }[]> = Array.from(
    { length: NUM_COMPONENTS },
    (_, ci) => {
      const comp = components[ci];
      const state: LedState = comp?.result === "fail" ? "red" : "green";
      return Array.from({ length: 16 }, () => ({
        state,
        componentId: comp?.component_id ?? `comp_${ci}`,
        errorCode: comp?.error_code,
      }));
    }
  );

  const failingComponents = components.filter((c) => c.result === "fail");

  return (
    <div>
      <ConceptBar />
      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-400 mb-4">
          <Link href="/" className="hover:text-white">Fleet</Link>
          <span>/</span>
          <span className="text-gray-300">{id}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <LedIndicator state={ledState} size="lg" />
            <div>
              <h1 className="text-xl font-bold text-white">{id}</h1>
              {device && (
                <p className="text-sm text-gray-400">
                  {(device.hostname as string) ?? ""}
                  {" · "}
                  {(device.location as { datacenter?: string })?.datacenter}
                  {" · "}
                  {(device.location as { rack?: string })?.rack}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div id="sse-badge" className="flex items-center gap-2 text-xs">
              <span className={`flex items-center gap-1.5 px-2 py-1 rounded border ${sseConnected ? "border-green-700/60 text-green-400" : "border-gray-700 text-gray-500"}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${sseConnected ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
                {sseConnected ? "↻ Live via Atlas Change Stream" : "Connecting..."}
                <span className="text-gray-400 ml-1">(like a SQL trigger)</span>
              </span>
            </div>
            <GuidedTour steps={DEVICE_TOUR_STEPS} label="Page Tour" stepCount={DEVICE_TOUR_STEPS.length} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Core Health Grid */}
            <div id="core-grid" className="bg-gray-900 border border-gray-800 rounded-lg p-5">
              <div className="flex items-start justify-between mb-1">
                <h2 className="text-sm font-semibold text-gray-200">16×16 Core Health Grid</h2>
                <span className="text-xs text-gray-400">each row = one PCIe component · each cell = one CPU core</span>
              </div>

              {/* Failing components callout */}
              {failingComponents.length > 0 && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-rose-950/30 border border-rose-800/40 text-xs text-rose-300 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="font-medium text-rose-200">Failing components:</span>
                  {failingComponents.map((c) => (
                    <span key={c.component_id} className="font-mono">
                      {c.component_id}{c.error_code ? ` (${c.error_code})` : ""}
                    </span>
                  ))}
                </div>
              )}

              {/* Grid with row labels */}
              <div className="flex gap-2">
                {/* Row labels */}
                <div className="flex flex-col gap-0.5 pt-0.5 shrink-0">
                  {coreGrid.map((row, ci) => (
                    <div key={ci} className="h-4 flex items-center">
                      <span className="text-xs font-mono text-gray-400 w-20 truncate" title={row[0].componentId}>
                        {row[0].componentId}
                      </span>
                    </div>
                  ))}
                </div>
                {/* Cells */}
                <div className="flex-1">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(16, minmax(0, 1fr))", gap: "2px" }}>
                    {coreGrid.flat().map((cell, i) => (
                      <div
                        key={i}
                        className={`aspect-square rounded-sm ${cell.state === "red" ? "bg-red-500/90" : "bg-green-400/35"}`}
                        title={`${cell.componentId} core ${i % 16}${cell.errorCode ? ` — ${cell.errorCode}` : ""}`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-5 mt-3 text-xs text-gray-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-green-400/35 inline-block" /> Pass — loopback &lt;400 ms
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-red-500/90 inline-block" /> Fail — loopback timeout or error
                </span>
              </div>
            </div>

            {/* Telemetry Chart */}
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <TelemetryChart runs={runs} queryInfo={queryInfo ?? undefined} />
            </div>

            {/* Recent Test Runs */}
            <div id="test-run-history" className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-semibold text-gray-200">Recent Test Runs</h2>
                {queryInfo && (
                  <QueryTooltip queryInfo={queryInfo as Parameters<typeof QueryTooltip>[0]["queryInfo"]} label="query" />
                )}
                <span className="text-gray-400 text-xs ml-1">— each row is one document in <span className="font-mono text-yellow-400">test_runs</span></span>
              </div>
              <div className="space-y-1">
                {runs.slice(0, 10).map((run) => (
                  <div key={run.id}>
                    <button
                      onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
                      className="w-full flex items-center gap-3 text-xs text-left hover:bg-gray-800 rounded px-2 py-1.5 transition-colors"
                    >
                      <LedIndicator state={run.led_state} size="sm" />
                      <span className="text-gray-300 w-24 shrink-0">{fmtTime(run.started_at)}</span>
                      <span className={`w-10 shrink-0 font-medium ${run.status === "fail" ? "text-red-400" : "text-green-400"}`}>{run.status.toUpperCase()}</span>
                      <span className="text-gray-400">{run.duration_ms} ms</span>
                      {run.results?.components?.filter(c => c.result === "fail").map(c => (
                        <span key={c.component_id} className="text-rose-400 font-mono">{c.component_id}</span>
                      ))}
                      <span className="text-gray-400 ml-auto">{expandedRun === run.id ? "▾" : "▸"} JSON</span>
                    </button>
                    {expandedRun === run.id && (
                      <pre className="text-xs text-gray-400 bg-gray-950 rounded p-3 mt-1 overflow-auto max-h-48">
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
            {/* Document Viewer */}
            <div id="doc-viewer">
              {latestRun && (
                <DocumentViewer
                  doc={latestRun as unknown as Record<string, unknown>}
                  title="Latest test_run document"
                />
              )}
            </div>

            {/* Device metadata */}
            {device && (
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-200 mb-3">Device Metadata</h3>
                <div className="space-y-2.5 text-xs">
                  {Object.entries(device)
                    .filter(([k]) => !["id", "embedding", "_id"].includes(k))
                    .map(([k, v]) => (
                      <div key={k} className="flex items-start justify-between gap-3">
                        <span className="text-blue-400 font-mono shrink-0">{k}</span>
                        {DATE_FIELDS.has(k) && typeof v === "string" ? (
                          <span className="text-gray-300 text-right" title={String(v)}>{fmtDateTime(v)}</span>
                        ) : (
                          <MetaValue value={v} />
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* What you're looking at */}
            <div className="bg-slate-800 border border-slate-600 rounded-lg p-4 space-y-3 leading-relaxed">
              <p className="text-white font-semibold text-sm">What you're looking at</p>
              <p className="text-sm text-slate-200">
                <span className="text-blue-300 font-mono font-medium">test_runs</span> stores one document per loopback test.
                Each document embeds the component results — no JOIN needed to read pass/fail per PCIe card.
              </p>
              <p className="text-sm text-slate-200">
                The live LED uses <span className="text-green-300 font-medium">Atlas Change Streams</span>:
                a real-time event that fires the moment any document in{" "}
                <span className="text-blue-300 font-mono font-medium">test_runs</span> changes.
              </p>
              <p className="text-xs text-slate-400 border-t border-slate-600 pt-2">
                SQL equivalent: stored procedure + LISTEN/NOTIFY + a separate JOIN query on every event.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
