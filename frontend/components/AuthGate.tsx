"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

export const AUTH_KEY = "socpulse-auth";

export const OPERATOR_USER = "operator";
export const OPERATOR_PASS = "socpulse2025";

export function isAuthed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(AUTH_KEY) === "1";
}

export function signIn() {
  window.localStorage.setItem(AUTH_KEY, "1");
  window.dispatchEvent(new Event("socpulse-auth-change"));
}

export function signOut() {
  window.localStorage.removeItem(AUTH_KEY);
  window.dispatchEvent(new Event("socpulse-auth-change"));
}

function subscribeAuth(cb: () => void): () => void {
  window.addEventListener("socpulse-auth-change", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("socpulse-auth-change", cb);
    window.removeEventListener("storage", cb);
  };
}

/**
 * Client-side auth gate. Redirects unauthenticated visitors to /login,
 * and bounces authenticated visitors away from /login. Renders nothing
 * until the check resolves so protected content never flashes.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // Read auth from localStorage via an external store so we never call
  // setState in an effect. localStorage is shared across tabs so "View Full
  // Detail" opening a new tab stays authenticated. Server snapshot is always
  // false (no flash of protected content); the client reconciles on hydration.
  const authed = useSyncExternalStore(subscribeAuth, isAuthed, () => false);

  // Gate redirects behind a post-mount flag. During hydration the store's
  // server snapshot is always false, which would otherwise bounce a deep link
  // (e.g. /devices/123) to /login → / before the real auth state resolves.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  const needsLogin = !authed && pathname !== "/login";
  const bounceHome = authed && pathname === "/login";

  useEffect(() => {
    if (!ready) return;
    if (needsLogin) router.replace("/login");
    else if (bounceHome) router.replace("/");
  }, [ready, needsLogin, bounceHome, router]);

  // Render nothing until auth resolves (no flash of protected content, and no
  // hydration mismatch since server and first client render both return null).
  if (!ready || needsLogin || bounceHome) return null;
  return <>{children}</>;
}
