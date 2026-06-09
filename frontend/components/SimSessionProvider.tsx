"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSessionMode } from "@/lib/sessionMode";
import { onRouteChange } from "@/lib/simSession";

/** Wires pathname + session route guards when session mode is enabled. */
export default function SimSessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sessionMode = useSessionMode();

  useEffect(() => {
    if (!sessionMode) return;
    onRouteChange(pathname);
  }, [pathname, sessionMode]);

  return <>{children}</>;
}
