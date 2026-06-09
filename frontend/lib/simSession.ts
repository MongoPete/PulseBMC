/**
 * Client-side simulator session manager — explicit start, auto-stop on tab hide,
 * idle, route leave, and tab close (via sendBeacon).
 */
import { api } from "./api";
import { setSimRunning } from "./simState";
import {
  HEARTBEAT_INTERVAL_MS,
  SESSION_STORAGE_KEY,
  idleTimeoutMs,
  isSessionAllowedPath,
  isSessionModeEnabled,
  setBackendSessionMode,
} from "./simSessionConfig";

export type SimSessionPhase = "idle" | "starting" | "active" | "stopping";

export interface SimSessionState {
  phase: SimSessionPhase;
  sessionId: string | null;
  startedAt: number | null;
  lastStopReason: string | null;
}

type Listener = (state: SimSessionState) => void;

let state: SimSessionState = {
  phase: "idle",
  sessionId: null,
  startedAt: null,
  lastStopReason: null,
};

const listeners = new Set<Listener>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

function emit() {
  listeners.forEach((l) => l({ ...state }));
}

function setState(patch: Partial<SimSessionState>) {
  state = { ...state, ...patch };
  emit();
}

export function getSimSessionState(): SimSessionState {
  return { ...state };
}

export function subscribeSimSession(listener: Listener): () => void {
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
}

function clearTimers() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

function resetIdleTimer() {
  if (state.phase !== "active") return;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    void stopSimSession("idle");
  }, idleTimeoutMs());
}

function onInteraction() {
  resetIdleTimer();
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden" && state.phase === "active") {
    void stopSimSession("tab_hidden");
  }
}

function onPageHide() {
  if (state.phase !== "active" || !state.sessionId) return;
  const blob = new Blob([JSON.stringify({ session_id: state.sessionId })], {
    type: "application/json",
  });
  navigator.sendBeacon("/api/demo/session/stop", blob);
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  clearTimers();
  detachListeners();
  setSimRunning(false);
  setState({ phase: "idle", sessionId: null, startedAt: null, lastStopReason: "tab_closed" });
}

function attachListeners() {
  if (listenersAttached || typeof window === "undefined") return;
  listenersAttached = true;
  document.addEventListener("visibilitychange", onVisibilityChange);
  window.addEventListener("pagehide", onPageHide);
  window.addEventListener("mousemove", onInteraction, { passive: true });
  window.addEventListener("keydown", onInteraction, { passive: true });
  window.addEventListener("click", onInteraction, { passive: true });
  window.addEventListener("scroll", onInteraction, { passive: true });
}

function detachListeners() {
  if (!listenersAttached || typeof window === "undefined") return;
  listenersAttached = false;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  window.removeEventListener("pagehide", onPageHide);
  window.removeEventListener("mousemove", onInteraction);
  window.removeEventListener("keydown", onInteraction);
  window.removeEventListener("click", onInteraction);
  window.removeEventListener("scroll", onInteraction);
}

async function sendHeartbeat(sessionId: string) {
  try {
    await api.demo.sessionHeartbeat(sessionId);
  } catch {
    try {
      await api.demo.sessionHeartbeat(sessionId);
    } catch {
      void stopSimSession("heartbeat_failed");
    }
  }
}

export async function startSimSession(): Promise<void> {
  if (state.phase === "starting" || state.phase === "active") return;

  let sessionMode = isSessionModeEnabled();
  if (!sessionMode) {
    try {
      const demo = await api.demo.state();
      if (demo.session_mode) {
        setBackendSessionMode(true);
        sessionMode = true;
      }
    } catch {
      /* fall through */
    }
  }
  if (!sessionMode) return;

  setState({ phase: "starting", lastStopReason: null });
  try {
    const res = await api.demo.sessionStart();
    const sessionId = res.session_id;
    sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    setSimRunning(true);
    setState({
      phase: "active",
      sessionId,
      startedAt: Date.now(),
    });
    attachListeners();
    resetIdleTimer();
    await sendHeartbeat(sessionId);
    heartbeatTimer = setInterval(() => {
      if (state.sessionId) void sendHeartbeat(state.sessionId);
    }, HEARTBEAT_INTERVAL_MS);
  } catch (e) {
    setState({ phase: "idle", sessionId: null, startedAt: null });
    throw e;
  }
}

export async function stopSimSession(reason = "manual"): Promise<void> {
  if (state.phase === "idle" || state.phase === "stopping") return;

  const sessionId = state.sessionId ?? sessionStorage.getItem(SESSION_STORAGE_KEY);
  setState({ phase: "stopping", lastStopReason: reason });
  clearTimers();
  detachListeners();

  if (sessionId) {
    try {
      await api.demo.sessionStop(sessionId);
    } catch {
      /* best effort */
    }
  }
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
  setSimRunning(false);
  setState({
    phase: "idle",
    sessionId: null,
    startedAt: null,
    lastStopReason: reason,
  });
}

/** Call from SimSessionProvider when route changes. */
export function onRouteChange(pathname: string) {
  if (!isSessionModeEnabled()) return;
  if (state.phase === "active" && !isSessionAllowedPath(pathname)) {
    void stopSimSession("left_allowed_route");
  }
}

export { isSessionModeEnabled };
