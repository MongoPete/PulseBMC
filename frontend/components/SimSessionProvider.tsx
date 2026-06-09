"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isSessionModeEnabled } from "@/lib/simSessionConfig";
import { onRouteChange } from "@/lib/simSession";

/** Wires pathname + session route guards when session mode is enabled. */
export default function SimSessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    if (!isSessionModeEnabled()) return;
    onRouteChange(pathname);
  }, [pathname]);

  return <>{children}</>;
}
