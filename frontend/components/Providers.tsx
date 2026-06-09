"use client";

import { SessionProvider } from "next-auth/react";
import SimSessionProvider from "@/components/SimSessionProvider";
import { SessionModeProvider } from "@/lib/sessionMode";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SessionModeProvider>
        <SimSessionProvider>{children}</SimSessionProvider>
      </SessionModeProvider>
    </SessionProvider>
  );
}
