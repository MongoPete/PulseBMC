"use client";
import { useEffect, useState, useCallback } from "react";
import ConceptBar from "@/components/ConceptBar";
import DeviceGrid from "@/components/DeviceGrid";
import DemoControls from "@/components/DemoControls";
import GuidedTour from "@/components/GuidedTour";
import LiveFeed from "@/components/LiveFeed";
import { api, SSE_URL } from "@/lib/api";

interface Device {
  device_id: string;
  hostname: string;
  status: string;
}

type LedState = "green" | "flashing_green" | "red" | "off";

export default function FleetPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [liveStates, setLiveStates] = useState<Record<string, LedState>>({});
  const [pulses, setPulses] = useState<Record<string, number>>({});
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshAll = useCallback(async () => {
    try {
      const [devRes, stateRes] = await Promise.all([
        api.devices(),
        api.fleetStates(),
      ]);
      setDevices(devRes.data ?? []);
      // Merge polled states — SSE events take precedence via the setState pattern below
      setLiveStates((prev) => ({ ...stateRes as Record<string, LedState>, ...prev }));
      setLastRefresh(new Date());
    } catch {
      /* silent — keep showing last data */
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load, then re-poll states every 5s
  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 5000);
    return () => clearInterval(interval);
  }, [refreshAll]);

  // SSE for immediate LED state changes (new test runs ingest)
  useEffect(() => {
    const es = new EventSource(SSE_URL);
    es.onmessage = (e) => {
      const payload = JSON.parse(e.data);
      if (payload.device_id && payload.led_state) {
        setLiveStates((prev) => ({ ...prev, [payload.device_id]: payload.led_state as LedState }));
        // Flash a capture ring on the device whenever a loopback result lands
        setPulses((prev) => ({ ...prev, [payload.device_id]: Date.now() }));
      }
    };
    return () => es.close();
  }, []);

  const failureCount = Object.values(liveStates).filter((s) => s === "red").length;

  return (
    <div>
      <div id="concept-bar">
        <ConceptBar />
      </div>

      <main className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white">Fleet Overview</h1>
            <p className="text-sm text-gray-400 mt-1">
              {devices.length} devices
              {failureCount > 0 && (
                <span className="text-rose-400 mx-1">· {failureCount} failure{failureCount !== 1 ? "s" : ""}</span>
              )}
              <span className="text-gray-400 mx-1">·</span>
              <span className="text-gray-300">Live via Atlas Change Streams</span>
              {lastRefresh && (
                <span className="text-gray-400 ml-1">· {lastRefresh.toLocaleTimeString()}</span>
              )}
            </p>
          </div>
          <GuidedTour />
        </div>

        {/* Two-column layout: left = grid + controls, right = live feed */}
        <div className="flex gap-6 items-start">
          {/* Left column */}
          <div className="flex-1 min-w-0">
            {/* LED Grid */}
            <div id="device-grid" className="mb-5">
              {loading ? (
                <div className="text-gray-300 text-sm">Connecting to Atlas...</div>
              ) : (
                <DeviceGrid devices={devices} liveStates={liveStates} pulses={pulses} />
              )}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 text-xs text-gray-300 mb-6">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block shadow-[0_0_6px_rgba(74,222,128,0.5)]" /> Healthy
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse inline-block" /> Test running
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block shadow-[0_0_6px_rgba(239,68,68,0.6)]" /> Failure
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-gray-600 inline-block" /> Offline
              </span>
            </div>

            {/* Demo Controls */}
            <DemoControls onAction={refreshAll} />
          </div>

          {/* Right column — live event feed */}
          <div id="live-feed" className="w-80 shrink-0 h-[540px]">
            <LiveFeed />
          </div>
        </div>
      </main>
    </div>
  );
}
