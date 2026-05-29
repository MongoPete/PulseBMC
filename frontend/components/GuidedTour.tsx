"use client";
import { useState, useEffect } from "react";
import { Joyride, Step, STATUS, EventData } from "react-joyride";

// ─── Step content helpers ────────────────────────────────────────────────────

export function TourCard({ children }: { children: React.ReactNode }) {
  return <div className="text-sm leading-relaxed space-y-3 text-gray-800">{children}</div>;
}

export function WhyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 leading-relaxed">
      <span className="font-semibold">Why MongoDB: </span>{children}
    </div>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-gray-100 text-gray-700 rounded px-1.5 py-0.5 text-xs font-mono mx-0.5">
      {children}
    </span>
  );
}

// ─── Fleet page steps (default) ──────────────────────────────────────────────

const FLEET_STEPS: Step[] = [
  {
    target: "#device-grid",
    title: "Step 1 — Fleet at a Glance",
    content: (
      <TourCard>
        <p>
          Each chip represents a BMC device running a PCIe loopback test every 10 seconds.
          The label shows its rack coordinates (<Pill>R1-S3</Pill> = Rack 1, Slot 3).
        </p>
        <p>
          <strong>Chip colors:</strong> green = healthy · <span className="text-amber-500 font-medium">amber = test running</span> · <span className="text-red-600 font-medium">red = failure</span>
        </p>
        <p>
          Every result is a document written to MongoDB Atlas the instant the test completes —
          no polling, no ETL. The grid updates in real time via Server-Sent Events.
        </p>
        <WhyBox>
          A single <Pill>test_runs</Pill> document holds the overall result, each PCIe component,
          and every CPU core — data that would need 3 SQL tables and 2 JOINs.
        </WhyBox>
      </TourCard>
    ),
  },
  {
    target: "#device-grid",
    title: "Step 2 — Inspect Without Leaving the Screen",
    content: (
      <TourCard>
        <p>
          <strong>Click any chip</strong> to open the slide-over drawer — component health grid,
          last 10 runs, NVMe SMART telemetry, and hardware location (datacenter › rack › slot).
        </p>
        <p>
          From the drawer you can <em>Rerun</em> the test immediately or <em>Isolate</em>
          the device to maintenance mode without navigating away.
        </p>
        <p>
          <strong>Right-click</strong> any chip for the same actions as a context menu.
        </p>
        <WhyBox>
          Device metadata, test history, and SMART telemetry are all in the same Atlas cluster —
          one query path, no cross-service joins required.
        </WhyBox>
      </TourCard>
    ),
  },
  {
    target: "#demo-controls",
    title: "Step 3 — Trigger a Failure Scenario",
    content: (
      <TourCard>
        <p>
          Expand <strong>Demo Scenarios</strong> (the toggle below the grid) and click
          <em>"Burst Failure — Device 15"</em>. Five failure documents are written to Atlas in rapid succession.
        </p>
        <p>
          MongoDB evaluates a 10% failure-rate threshold on every insert using a compound-indexed
          <Pill>$group</Pill> aggregation — no cron job, no rules engine.
        </p>
        <p className="text-gray-600 text-xs">
          Watch chip 15 turn red, then right-click it to rerun or isolate directly from the grid.
        </p>
        <WhyBox>
          Threshold detection runs as a sub-millisecond indexed aggregation at ingest speed.
        </WhyBox>
      </TourCard>
    ),
  },
  {
    target: "#alerts-nav",
    placement: "bottom" as const,
    title: "Step 4 — AI Root Cause + Work Order",
    content: (
      <TourCard>
        <p>
          Click <strong>Alerts</strong> in the nav. The alert is already there, auto-created by
          the aggregation that runs on each insert.
        </p>
        <p>
          Hit <em>"Run AI Analysis"</em> to trigger the 3-stage agent chain:
          failure prediction → root cause (grounded in temperature data + upstream fault context) → work order with physical location.
        </p>
        <p>
          The accordion on each alert reveals the full AI output — expand to see the root cause
          hypothesis, confidence score, and technician work order referencing the rack location.
        </p>
        <WhyBox>
          Atlas Vector Search retrieves semantically similar past failures. Voyage AI embeddings,
          MongoDB retrieval — no Pinecone, no separate vector store.
        </WhyBox>
      </TourCard>
    ),
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  steps?: Step[];
  label?: string;
  stepCount?: number;
}

export default function GuidedTour({ steps = FLEET_STEPS, label = "Guided Tour", stepCount }: Props) {
  const [run, setRun] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const handleEvent = (data: EventData) => {
    if (data.status === STATUS.FINISHED || data.status === STATUS.SKIPPED) {
      setRun(false);
    }
  };

  if (!mounted) return null;

  const count = stepCount ?? steps.length;

  return (
    <>
      <Joyride
        steps={steps}
        run={run}
        continuous
        scrollToFirstStep
        onEvent={handleEvent}
        options={{
          buttons: ["back", "close", "primary", "skip"],
          skipBeacon: true,
          showProgress: true,
          overlayColor: "rgba(0,0,0,0.6)",
        }}
        locale={{
          nextWithProgress: "Next ({current} of {total})",
          skip: "Skip tour",
          last: "Done",
        }}
      />
      <button
        onClick={() => setRun(true)}
        id="start-tour"
        className="flex items-center gap-2 text-sm border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 px-3 py-1.5 rounded-lg transition-colors"
      >
        <span style={{ color: "#009999" }}>▶</span> {label}
        <span className="text-slate-400 text-xs">{count} steps</span>
      </button>
    </>
  );
}
