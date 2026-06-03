"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import QueryTooltip from "./QueryTooltip";
import { fmtClock } from "@/lib/time";

interface ThermalReading {
  ts: string;
  readings: {
    baseline_temp_c: number;
    in_degradation: boolean;
    degradation_phase_remaining?: number;
    led_state?: string;
  };
}

interface Props {
  readings: ThermalReading[];
  queryInfo?: Record<string, unknown>;
}

const HEALTHY_MAX = 62;
const DEGRADATION_THRESHOLD = 76;

export default function ThermalTrendChart({ readings, queryInfo }: Props) {
  if (readings.length === 0) return null;

  const data = readings.map((r) => ({
    time: fmtClock(r.ts),
    temp: r.readings.baseline_temp_c,
    inDegradation: r.readings.in_degradation,
    ledState: r.readings.led_state,
  }));

  const latest = data[data.length - 1];
  const isHot = latest && latest.temp > HEALTHY_MAX;
  const isDegrading = latest && latest.inDegradation;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-700">
            Thermal Baseline (last {readings.length} readings)
          </h3>
          {queryInfo && (
            <QueryTooltip
              queryInfo={queryInfo as Parameters<typeof QueryTooltip>[0]["queryInfo"]}
              label="query"
            />
          )}
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 border border-teal-200 text-teal-700 font-mono">
            Atlas Time-Series Collection
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-teal-500 inline-block" /> Healthy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-amber-500 inline-block border-dashed" /> Pre-warn
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-red-500 inline-block" /> Critical
          </span>
        </div>
      </div>

      {/* Pre-warming callout — the demo moment */}
      {isDegrading && !isHot && (
        <div className="mb-2 px-3 py-1.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-700">
          <span className="font-semibold">Pre-warning:</span> temperature is rising before LED changes —
          this is the predictive signal proactive monitoring captures. SQL polling would miss this window.
        </div>
      )}
      {isHot && (
        <div className="mb-2 px-3 py-1.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">
          <span className="font-semibold">Thermal anomaly:</span>{" "}
          baseline {latest.temp}°C exceeds healthy max ({HEALTHY_MAX}°C).
        </div>
      )}

      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="time" tick={{ fill: "#94a3b8", fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            unit="°C"
            domain={[30, 100]}
          />
          <Tooltip
            contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6 }}
            labelStyle={{ color: "#1e293b" }}
            itemStyle={{ color: "#475569" }}
            formatter={(v: unknown) => [`${v}°C`, "Baseline temp"]}
          />
          {/* Healthy max — amber dashed */}
          <ReferenceLine
            y={HEALTHY_MAX}
            stroke="#f59e0b"
            strokeDasharray="4 2"
            label={{ value: `${HEALTHY_MAX}°C healthy max`, fill: "#f59e0b", fontSize: 9, position: "insideBottomRight" }}
          />
          {/* Degradation threshold — red dashed */}
          <ReferenceLine
            y={DEGRADATION_THRESHOLD}
            stroke="#dc2626"
            strokeDasharray="4 2"
            label={{ value: `${DEGRADATION_THRESHOLD}°C degradation`, fill: "#dc2626", fontSize: 9, position: "insideBottomRight" }}
          />
          <Line
            type="monotone"
            dataKey="temp"
            stroke="#0d9488"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>

      {/* MongoDB pitch note */}
      <p className="text-[10px] text-slate-400 mt-1">
        Stored in native MongoDB time-series collection — automatic bucketing, columnar compression ≈ 70–90% storage reduction vs standard collection.
        Secondary index: <span className="font-mono">{"{ meta.device_id: 1, ts: -1 }"}</span>
      </p>
    </div>
  );
}
