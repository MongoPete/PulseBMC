import type { Metadata } from "next";
import "./globals.css";
import AuthGate from "@/components/AuthGate";
import TopNav from "@/components/TopNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "SoCPulse — SoC Fleet Health",
  description: "SoC / BMC fleet health monitoring for data center operators — loopback diagnostics and automated fault isolation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen" style={{ background: "#F4F7F9", color: "#1B1B1B" }}>
        <AuthGate>
          <TopNav />
          {children}
          <SiteFooter />
        </AuthGate>
      </body>
    </html>
  );
}
