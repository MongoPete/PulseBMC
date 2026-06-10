import type { Metadata, Viewport } from "next";
import "./globals.css";
import Providers from "@/components/Providers";
import TopNav from "@/components/TopNav";
import MobileBottomNav from "@/components/MobileBottomNav";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "SoCPulse — SoC Fleet Health",
  description: "SoC / BMC fleet health monitoring for data center operators — loopback diagnostics and automated fault isolation",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body
        className="min-h-full flex flex-col overflow-x-clip mobile-safe-bottom md:pb-0"
        style={{ background: "#F4F7F9", color: "#1B1B1B" }}
      >
        <Providers>
          <TopNav />
          <div className="flex-1 flex flex-col min-w-0 w-full">{children}</div>
          <SiteFooter />
          <MobileBottomNav />
        </Providers>
      </body>
    </html>
  );
}
