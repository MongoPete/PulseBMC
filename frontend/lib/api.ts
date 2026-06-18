/** Same-origin proxy to the FastAPI backend (see app/api/proxy/[...path]/route.ts). */
const PROXY = "/api/proxy";

function toProxyPath(path: string): string {
  if (path.startsWith("/api/")) {
    return `${PROXY}${path.slice(4)}`;
  }
  return `${PROXY}${path}`;
}

export async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(toProxyPath(path), options);
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
  exploreFacets: () => apiFetch("/api/explore/facets"),
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
        failure_modes?: Record<string, string>;
        session_active?: boolean;
        session_mode?: boolean;
        session_id?: string | null;
      }>,
    sessionStart: () =>
      apiFetch("/api/demo/session/start", { method: "POST" }) as Promise<{
        session_id: string;
        expires_in_sec: number;
      }>,
    sessionHeartbeat: (sessionId: string) =>
      apiFetch("/api/demo/session/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      }),
    sessionStop: (sessionId: string) =>
      apiFetch("/api/demo/session/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      }),
    sessionStatus: () => apiFetch("/api/demo/session/status"),
    rerun: (deviceId: string) =>
      apiFetch(`/api/demo/rerun/${deviceId}`, { method: "POST" }),
    setFailureMode: (deviceId: string, mode: string) =>
      apiFetch(`/api/demo/set-failure-mode?device_id=${deviceId}&mode=${mode}`, { method: "POST" }),
  },
  telemetry: (deviceId: string, limit = 60) =>
    apiFetch(`/api/telemetry/${deviceId}?limit=${limit}`),
  isolateDevice: (id: string, status: "online" | "offline" | "maintenance") =>
    apiFetch(`/api/devices/${id}/status?status=${status}`, { method: "PATCH" }),
  latchCore: (deviceId: string, componentId: string, coreId: string, errorCode?: string, runId?: string) =>
    apiFetch(`/api/devices/${deviceId}/latch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: componentId, core_id: coreId, error_code: errorCode ?? null, run_id: runId ?? null }),
    }),
  clearLatch: (deviceId: string, componentId: string, coreId: string) =>
    apiFetch(`/api/devices/${deviceId}/latch/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ component_id: componentId, core_id: coreId }),
    }),
};

/** SSE via same-origin proxy — session cookie authenticates the stream. */
export const SSE_URL = `${PROXY}/test-runs/stream`;
