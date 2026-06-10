"use client";
import { useEffect, useRef, useState } from "react";
import type { LedState } from "./LedIndicator";

interface Device {
  device_id: string;
  hostname: string;
  status: string;
  led_state?: LedState;
  latched_failures?: Array<{ component_id: string; core_id: string }>;
}

interface ContextMenu {
  deviceId: string;
  mode: "sheet" | "pointer";
  x?: number;
  y?: number;
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
  green:         { border: "border-slate-200",  bg: "bg-white",        dot: "bg-green-500" },
  flashing_green:{ border: "border-slate-200",  bg: "bg-white",        dot: "bg-green-500 animate-pulse" },
  amber:         { border: "border-amber-300",  bg: "bg-amber-50",     dot: "bg-amber-400 amber-blink" },
  red:           { border: "border-red-300",    bg: "bg-red-50",       dot: "bg-red-600 failure-pulse" },
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
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // Defer so the opening tap doesn't bubble to document and instantly dismiss the sheet
    const timer = window.setTimeout(() => {
      document.addEventListener("click", close);
    }, 0);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  const openSheet = (deviceId: string) => {
    setContextMenu({ deviceId, mode: "sheet" });
  };

  return (
    <div className="relative w-full min-w-0 overflow-hidden">
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-1.5 sm:gap-2">
        {devices.map((device) => {
          const ledState = liveStates[device.device_id] ?? "green";
          const pulse = pulses[device.device_id];
          const style = STATE_STYLES[ledState] ?? STATE_STYLES.green;
          const coord = toCoord(device.device_id);
          const hasLatch = (device.latched_failures?.length ?? 0) > 0 && ledState !== "red";

          return (
            <div
              key={device.device_id}
              id={`led-${device.device_id}`}
              className={`relative flex flex-col items-center justify-center gap-0.5 sm:gap-1 p-2 sm:p-2.5 rounded border cursor-pointer select-none aspect-square min-w-0 overflow-hidden
                transition-colors active:bg-slate-100 hover:bg-slate-50 touch-manipulation
                ${style.border} ${style.bg}`}
              onClick={() => onDeviceClick?.(device.device_id)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (window.matchMedia("(min-width: 768px)").matches) {
                  setContextMenu({ deviceId: device.device_id, mode: "pointer", x: e.clientX, y: e.clientY });
                } else {
                  openSheet(device.device_id);
                }
              }}
            >
              {/* Mobile action menu */}
              <button
                type="button"
                aria-label={`Actions for ${device.device_id}`}
                className="md:hidden absolute top-1 right-1 w-7 h-7 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-white/80 text-sm leading-none"
                onClick={(e) => {
                  e.stopPropagation();
                  openSheet(device.device_id);
                }}
              >
                ⋮
              </button>

              {/* Capture ring */}
              {pulse && (
                <span
                  key={pulse}
                  className={`capture-ping absolute inset-0 rounded-lg border-2 pointer-events-none
                    ${ledState === "red" ? "border-red-400" : "border-green-400"}`}
                />
              )}

              {/* Status dot — larger on mobile for room-scale readability */}
              <span className={`w-5 h-5 sm:w-4 sm:h-4 rounded-full shrink-0 ${style.dot}`} />

              {/* Coordinate label */}
              <span className="text-[10px] font-mono text-slate-600 leading-tight text-center">
                {coord}
              </span>

              {/* Latch indicator */}
              {hasLatch && (
                <span
                  className="absolute top-1 left-1 md:top-1 md:right-1 md:left-auto text-[8px] text-amber-600 font-bold leading-none"
                  title={`${device.latched_failures!.length} operator-latched failure${device.latched_failures!.length !== 1 ? "s" : ""} — core passed last test but failure pinned until cleared`}
                >
                  ⚑
                </span>
              )}

              {device.status === "maintenance" && (
                <span className="text-[9px] text-amber-600 font-medium">isolated</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Context menu — bottom sheet on phone, pointer menu on desktop */}
      {contextMenu && (
        <>
          {contextMenu.mode === "sheet" && (
            <div
              className="fixed inset-0 z-50 bg-black/25 md:hidden"
              onClick={() => setContextMenu(null)}
            />
          )}
          <div
            ref={menuRef}
            className={`fixed z-50 bg-white border border-slate-200 shadow-lg
              ${contextMenu.mode === "sheet"
                ? "inset-x-0 bottom-0 rounded-t-2xl pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 md:hidden"
                : "rounded-lg py-1 min-w-[160px] hidden md:block"
              }`}
            style={
              contextMenu.mode === "pointer" && contextMenu.x != null && contextMenu.y != null
                ? { top: contextMenu.y, left: contextMenu.x }
                : undefined
            }
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wide border-b border-slate-100 md:px-3 md:py-1.5">
              {contextMenu.deviceId}
            </div>
            {CONTEXT_ACTIONS.map(({ key, label }) => (
              <button
                key={key}
                className="w-full text-left px-4 py-3 md:px-3 md:py-2 text-sm text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors min-h-[44px] md:min-h-0"
                onClick={() => {
                  onDeviceAction?.(contextMenu.deviceId, key);
                  setContextMenu(null);
                }}
              >
                {label}
              </button>
            ))}
            {contextMenu.mode === "sheet" && (
              <button
                className="w-full text-center px-4 py-3 text-sm text-slate-400 border-t border-slate-100 mt-1 min-h-[44px]"
                onClick={() => setContextMenu(null)}
              >
                Cancel
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
