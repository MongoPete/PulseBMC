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
        <h3 className="text-sm font-semibold text-slate-700">
          Loopback Test Duration (last 60 runs)
          {queryInfo && (
            <QueryTooltip queryInfo={queryInfo as Parameters<typeof QueryTooltip>[0]["queryInfo"]} label="query" />
          )}
        </h3>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-green-500 inline-block" /> Pass</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-red-500 inline-block" /> Fail</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} unit="ms" />
          <Tooltip
            contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6 }}
            labelStyle={{ color: "#1e293b" }}
            itemStyle={{ color: "#475569" }}
          />
          <ReferenceLine y={500} stroke="#cbd5e1" strokeDasharray="3 3" label={{ value: "500ms", fill: "#94a3b8", fontSize: 10 }} />
          <Line type="monotone" dataKey="duration" stroke="#009999" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="failed" stroke="#dc2626" strokeWidth={0} dot={{ r: 4, fill: "#dc2626" }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
