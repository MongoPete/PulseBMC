"use client";
import { useEffect, useRef, useState } from "react";
import type { LedState } from "./LedIndicator";

interface Device {
  device_id: string;
  hostname: string;
  status: string;
  led_state?: LedState;
}

interface ContextMenu {
  x: number;
  y: number;
  deviceId: string;
}

interface Props {
  devices: Device[];
  liveStates: Record<string, LedState>;
  pulses?: Record<string, number>;
  onDeviceClick?: (deviceId: string) => void;
  onDeviceAction?: (deviceId: string, action: "logs" | "analysis" | "rerun" | "isolate") => void;
}

/** Convert device-001..020 to a rack/slot coordinate label */
function toCoord(deviceId: string): string {
  const n = parseInt(deviceId.replace("device-", ""), 10);
  if (isNaN(n)) return deviceId.replace("device-", "");
  const rack = Math.ceil(n / 5);
  const slot = ((n - 1) % 5) + 1;
  return `R${rack}-S${slot < 10 ? "0" + slot : slot}`;
}

const STATE_STYLES: Record<LedState, { border: string; bg: string; dot: string }> = {
  green:         { border: "border-green-300",  bg: "bg-white",        dot: "bg-green-500 shadow-[0_0_4px_1px_rgba(34,197,94,0.5)]" },
  flashing_green:{ border: "border-green-300",  bg: "bg-white",        dot: "bg-green-500 animate-pulse shadow-[0_0_4px_1px_rgba(34,197,94,0.5)]" },
  amber:         { border: "border-amber-400",  bg: "bg-amber-50",     dot: "bg-amber-400 amber-blink" },
  red:           { border: "border-red-300",    bg: "bg-red-50",       dot: "bg-red-600 shadow-[0_0_4px_1px_rgba(220,38,38,0.4)]" },
  off:           { border: "border-slate-200",  bg: "bg-slate-50",     dot: "bg-slate-300" },
};

const CONTEXT_ACTIONS: { key: "logs" | "analysis" | "rerun" | "isolate"; label: string }[] = [
  { key: "logs",     label: "View Logs" },
  { key: "analysis", label: "Run Analysis" },
  { key: "rerun",    label: "Rerun Test" },
  { key: "isolate",  label: "Isolate Device" },
];

export default function DeviceGrid({ devices, liveStates, pulses = {}, onDeviceClick, onDeviceAction }: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = () => setContextMenu(null);
    document.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <div className="relative">
      <div className="grid grid-cols-5 sm:grid-cols-5 md:grid-cols-10 gap-2">
        {devices.map((device) => {
          const ledState = liveStates[device.device_id] ?? "green";
          const pulse = pulses[device.device_id];
          const style = STATE_STYLES[ledState] ?? STATE_STYLES.green;
          const coord = toCoord(device.device_id);

          return (
            <div
              key={device.device_id}
              id={`led-${device.device_id}`}
              className={`relative flex flex-col items-center gap-1 p-2.5 rounded-lg border cursor-pointer select-none
                transition-all hover:shadow-md hover:scale-[1.02]
                ${style.border} ${style.bg}`}
              onClick={() => onDeviceClick?.(device.device_id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, deviceId: device.device_id });
              }}
            >
              {/* Capture ring */}
              {pulse && (
                <span
                  key={pulse}
                  className={`capture-ping absolute inset-0 rounded-lg border-2 pointer-events-none
                    ${ledState === "red" ? "border-red-400" : "border-green-400"}`}
                />
              )}

              {/* Status dot */}
              <span className={`w-3 h-3 rounded-full shrink-0 ${style.dot}`} />

              {/* Coordinate label */}
              <span className="text-[10px] font-mono text-slate-600 leading-tight text-center">
                {coord}
              </span>

              {/* Offline badge */}
              {device.status === "maintenance" && (
                <span className="text-[9px] text-amber-600 font-medium">isolated</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100">
            {contextMenu.deviceId}
          </div>
          {CONTEXT_ACTIONS.map(({ key, label }) => (
            <button
              key={key}
              className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
              onClick={() => {
                onDeviceAction?.(contextMenu.deviceId, key);
                setContextMenu(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
