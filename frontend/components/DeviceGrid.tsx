"use client";
import Link from "next/link";
import LedIndicator from "./LedIndicator";

interface Device {
  device_id: string;
  hostname: string;
  status: string;
  led_state?: "green" | "flashing_green" | "red" | "off";
}

interface Props {
  devices: Device[];
  liveStates: Record<string, "green" | "flashing_green" | "red" | "off">;
  /** device_id → timestamp of last captured loopback; changing value replays the ping */
  pulses?: Record<string, number>;
}

export default function DeviceGrid({ devices, liveStates, pulses = {} }: Props) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-10 gap-3">
      {devices.map((device) => {
        const ledState = liveStates[device.device_id] ?? "green";
        const pulse = pulses[device.device_id];
        const ringColor = ledState === "red" ? "border-red-500" : "border-green-400";
        return (
          <Link
            key={device.device_id}
            href={`/devices/${device.device_id}`}
            className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-gray-900 border border-gray-800 hover:border-gray-500 transition-colors group"
            id={`led-${device.device_id}`}
          >
            <span className="relative inline-flex items-center justify-center">
              {/* One-shot capture ring — remounts (new key) on each loopback */}
              {pulse && (
                <span
                  key={pulse}
                  className={`capture-ping absolute w-8 h-8 rounded-full border-2 ${ringColor} pointer-events-none`}
                />
              )}
              <LedIndicator state={ledState} size="lg" />
            </span>
            <span className="text-xs text-gray-300 group-hover:text-white text-center leading-tight font-mono">
              {device.device_id.replace("device-", "")}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
