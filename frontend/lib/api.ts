const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API}${path}`, options);
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json();
}

export const api = {
  fleetStates: () => apiFetch("/api/fleet/states") as Promise<Record<string, string>>,
  devices: () => apiFetch("/api/devices"),
  device: (id: string) => apiFetch(`/api/devices/${id}`),
  testRuns: (deviceId?: string, limit = 50) =>
    apiFetch(`/api/test-runs?${deviceId ? `device_id=${deviceId}&` : ""}limit=${limit}`),
  alerts: (status = "open") => apiFetch(`/api/alerts?status=${status}`),
  agentChain: (alertId: string, deviceId: string, forceRefresh = false) =>
    apiFetch("/api/agents/chain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alert_id: alertId, device_id: deviceId, force_refresh: forceRefresh }),
    }),
  agentRun: (id: string) => apiFetch(`/api/agents/runs/${id}`),
  knowledgeBase: () => apiFetch("/api/agents/knowledge-base"),
  explore: (question: string) =>
    apiFetch("/api/explore/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    }),
  demo: {
    burstFailure: (deviceId = "device-015") =>
      apiFetch(`/api/demo/burst-failure?device_id=${deviceId}`, { method: "POST" }),
    trendingFailure: (deviceId = "device-007") =>
      apiFetch(`/api/demo/trending-failure?device_id=${deviceId}`, { method: "POST" }),
    offlineBuffer: () => apiFetch("/api/demo/offline-buffer", { method: "POST" }),
    reset: () => apiFetch("/api/demo/reset", { method: "POST" }),
    simulator: (action: "start" | "stop" | "restart") =>
      apiFetch(`/api/demo/simulator/${action}`, { method: "POST" }) as Promise<{ running: boolean; changed?: boolean }>,
    state: () =>
      apiFetch("/api/demo/state") as Promise<{
        simulator_running: boolean;
        offline_buffer: boolean;
        burst_failure_devices: string[];
        trending_failure_devices: string[];
      }>,
    rerun: (deviceId: string) =>
      apiFetch(`/api/demo/rerun/${deviceId}`, { method: "POST" }),
    setFailureMode: (deviceId: string, mode: string) =>
      apiFetch(`/api/demo/set-failure-mode?device_id=${deviceId}&mode=${mode}`, { method: "POST" }),
  },
  isolateDevice: (id: string, status: "online" | "offline" | "maintenance") =>
    apiFetch(`/api/devices/${id}/status?status=${status}`, { method: "PATCH" }),
};

export const SSE_URL = `${API}/api/test-runs/stream`;
