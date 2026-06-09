"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";
import { isSessionModeEnabled, setBackendSessionMode } from "./simSessionConfig";

const SessionModeContext = createContext(false);

/** Env flag or backend demo/state.session_mode (Railway SIM_SESSION_MODE without Vercel env). */
export function SessionModeProvider({ children }: { children: React.ReactNode }) {
  const [sessionMode, setSessionMode] = useState(isSessionModeEnabled());

  useEffect(() => {
    api.demo
      .state()
      .then((s) => {
        if (s.session_mode) {
          setBackendSessionMode(true);
          setSessionMode(true);
        }
      })
      .catch(() => {});
  }, []);

  return <SessionModeContext.Provider value={sessionMode}>{children}</SessionModeContext.Provider>;
}

export function useSessionMode(): boolean {
  return useContext(SessionModeContext);
}
