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
    title: "What is PulseBMC?",
    content: (
      <TourCard>
        <p>
          A <strong>BMC</strong> (Baseboard Management Controller) is a tiny computer built into every server.
          It monitors hardware health 24/7 — temperature, power, memory — even when the main OS is off.
        </p>
        <p>
          <strong>PulseBMC</strong> simulates a fleet of 20 BMCs running a <em>loopback test</em>:
          a self-check that sends a signal through the PCIe card and expects it back within 400 ms.
          Pass = green LED. Fail = red LED.
        </p>
        <p className="text-gray-600 text-xs">Click any LED to drill into that device's history.</p>
      </TourCard>
    ),
  },
  {
    target: "#concept-bar",
    title: "Where does the data live?",
    content: (
      <TourCard>
        <p>
          Every loopback result is a <strong>document</strong> written to MongoDB Atlas the instant
          the test completes. Think of a document like a SQL row — but it can contain nested objects.
        </p>
        <p>
          A single <Pill>test_runs</Pill> document holds the overall result <em>and</em> each
          component result inside it. In SQL you'd need 3 tables and 2 JOINs to read the same data.
        </p>
        <WhyBox>
          Embedded documents eliminate JOINs on the hot read path. Reading LED states for
          20 devices every 3 seconds — that difference compounds fast.
        </WhyBox>
      </TourCard>
    ),
  },
  {
    target: "#demo-controls",
    title: "Step 1: Trigger a failure",
    content: (
      <TourCard>
        <p>
          Expand <strong>Demo Scenarios</strong> and click <em>"Burst Failure — Device 15"</em>.
          This writes 5 consecutive failure documents directly to Atlas.
        </p>
        <p>
          MongoDB evaluates the 10% failure-rate threshold on every insert using a
          compound-indexed <Pill>$group</Pill> aggregation. No separate rules engine or cron job.
        </p>
        <p className="text-gray-600 text-xs">
          Watch LED 15 turn red within a second. Then click <strong>Alerts</strong> in the nav.
        </p>
        <WhyBox>
          Threshold detection runs as a sub-millisecond indexed query at ingest speed.
        </WhyBox>
      </TourCard>
    ),
  },
  {
    target: "#alerts-nav",
    placement: "bottom" as const,
    title: "Step 2: Go to Alerts",
    content: (
      <TourCard>
        <p>
          Click <strong>Alerts</strong> in the navigation bar above.
        </p>
        <p>
          After triggering the burst failure, an alert will already be there — automatically
          created by the aggregation query that runs on each insert.
        </p>
        <p>
          On the Alerts page, hit <em>"Run AI Analysis"</em> to see the three-stage AI agent
          pipeline: failure prediction → root cause → work order.
        </p>
        <p className="text-gray-600 text-xs">
          The Alerts page has its own guided tour button to walk you through the AI output.
        </p>
      </TourCard>
    ),
  },
  {
    target: "#explore-nav",
    placement: "bottom" as const,
    title: "Step 3: Go to Explorer",
    content: (
      <TourCard>
        <p>
          Click <strong>Explorer</strong> in the nav to ask plain-English questions about your fleet.
        </p>
        <p>
          Try: <em>"Which device has the highest failure rate?"</em> or{" "}
          <em>"What error codes appeared most in the last 24 hours?"</em>
        </p>
        <p>
          Every answer shows you the MongoDB query and SQL equivalent side-by-side —
          so you can see exactly how the database produced the result.
        </p>
        <p className="text-gray-600 text-xs">
          The Explorer page also has its own guided tour.
        </p>
        <WhyBox>
          Same data model at the edge and in the cloud. One query language, one schema.
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
        className="flex items-center gap-2 text-sm border border-slate-600 text-slate-300 bg-slate-900 hover:bg-slate-800 px-3 py-1.5 rounded-lg transition-colors"
      >
        <span className="text-emerald-400">▶</span> {label}
        <span className="text-slate-400 text-xs">{count} steps</span>
      </button>
    </>
  );
}
