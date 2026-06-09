/** Session mode flag — set NEXT_PUBLIC_SIM_SESSION_MODE=true on Vercel for customer demos. */
export function isSessionModeEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SIM_SESSION_MODE === "true";
}

export const SESSION_ALLOWED_PATHS = ["/", "/alerts"];

export function isSessionAllowedPath(pathname: string): boolean {
  return SESSION_ALLOWED_PATHS.includes(pathname);
}

export function idleTimeoutMs(): number {
  const sec = parseInt(process.env.NEXT_PUBLIC_SIM_IDLE_TIMEOUT_SEC ?? "180", 10);
  return (Number.isFinite(sec) ? sec : 180) * 1000;
}

export const HEARTBEAT_INTERVAL_MS = 30_000;
export const SESSION_STORAGE_KEY = "socpulse-sim-session-id";
