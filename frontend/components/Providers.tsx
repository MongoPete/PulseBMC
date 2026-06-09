"use client";

import { SessionProvider } from "next-auth/react";
import SimSessionProvider from "@/components/SimSessionProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SimSessionProvider>{children}</SimSessionProvider>
    </SessionProvider>
  );
}
