import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import LiveClock from "@/components/LiveClock";

export const metadata: Metadata = {
  title: "PulseBMC — Hardware Health Dashboard",
  description: "BMC fleet health monitoring powered by MongoDB Atlas",
};

function SiemensLogo() {
  return (
    <span
      style={{
        fontFamily: "Arial, sans-serif",
        fontWeight: 700,
        letterSpacing: "0.18em",
        fontSize: "12px",
        color: "#009999",
        textTransform: "uppercase",
      }}
    >
      SIEMENS
    </span>
  );
}

function MongoDBBadge() {
  return (
    <span className="flex items-center gap-1 text-xs text-slate-500">
      <span style={{ color: "#00ED64", fontSize: "10px" }}>●</span>
      <span>MongoDB Atlas</span>
    </span>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen" style={{ background: "#F4F7F9", color: "#1B1B1B" }}>
        <nav
          className="sticky top-0 z-40 border-b"
          style={{ background: "#ffffff", borderColor: "#e2e8f0" }}
        >
          <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
            <div className="flex items-center gap-6">
              {/* Brand lockup */}
              <div className="flex items-center gap-3">
                <SiemensLogo />
                <span className="text-slate-300 text-sm">×</span>
                <Link href="/" className="font-bold tracking-tight text-slate-800 text-sm">
                  Pulse<span style={{ color: "#009999" }}>BMC</span>
                </Link>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <Link id="fleet-nav" href="/" className="text-slate-500 hover:text-slate-900 transition-colors">
                  Fleet
                </Link>
                <Link id="alerts-nav" href="/alerts" className="text-slate-500 hover:text-slate-900 transition-colors">
                  Alerts
                </Link>
                <Link id="explore-nav" href="/explore" className="text-slate-500 hover:text-slate-900 transition-colors">
                  Explorer
                </Link>
                <Link href="/architecture" className="text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-1">
                  <span style={{ color: "#009999" }} className="text-[10px]">◈</span> How It Works
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <LiveClock />
              <MongoDBBadge />
              <div
                id="atlas-badge"
                className="text-xs text-slate-500 border rounded px-2 py-1"
                style={{ borderColor: "#e2e8f0" }}
              >
                <span style={{ color: "#009999" }}>●</span> Atlas: back-to-basics-crud
              </div>
            </div>
          </div>
        </nav>
        {children}
        {/* Footer branding */}
        <footer className="mt-12 border-t py-4" style={{ borderColor: "#e2e8f0" }}>
          <div className="max-w-7xl mx-auto px-4 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-3">
              <SiemensLogo />
              <span>×</span>
              <span style={{ color: "#00ED64" }}>●</span>
              <span>MongoDB Atlas</span>
            </div>
            <span>BMC Fleet Health Monitoring POC</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
