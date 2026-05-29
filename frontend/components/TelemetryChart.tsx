"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import QueryTooltip from "./QueryTooltip";
import { fmtClock } from "@/lib/time";

interface Run {
  started_at: string;
  status: string;
  duration_ms: number;
  led_state: string;
}

interface Props {
  runs: Run[];
  queryInfo?: Record<string, unknown>;
}

export default function TelemetryChart({ runs, queryInfo }: Props) {
  const data = [...runs].reverse().slice(-60).map((r) => ({
    time: fmtClock(r.started_at),
    duration: r.duration_ms,
    failed: r.status === "fail" ? r.duration_ms : null,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-200">
          Loopback Test Duration (last 60 runs)
          {queryInfo && (
            <QueryTooltip queryInfo={queryInfo as Parameters<typeof QueryTooltip>[0]["queryInfo"]} label="query" />
          )}
        </h3>
        <div className="flex items-center gap-3 text-xs text-gray-300">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green-400 inline-block" /> Pass</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Fail</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis dataKey="time" tick={{ fill: "#9ca3af", fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "#9ca3af", fontSize: 10 }} unit="ms" />
          <Tooltip
            contentStyle={{ background: "#1f2937", border: "1px solid #4b5563", borderRadius: 6 }}
            labelStyle={{ color: "#e5e7eb" }}
            itemStyle={{ color: "#d1d5db" }}
          />
          <ReferenceLine y={500} stroke="#4b5563" strokeDasharray="3 3" label={{ value: "500ms", fill: "#9ca3af", fontSize: 10 }} />
          <Line type="monotone" dataKey="duration" stroke="#4ade80" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="failed" stroke="#ef4444" strokeWidth={0} dot={{ r: 4, fill: "#ef4444" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
