import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import LiveClock from "@/components/LiveClock";

export const metadata: Metadata = {
  title: "PulseBMC — Hardware Health Dashboard",
  description: "BMC fleet health monitoring powered by MongoDB Atlas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <nav className="border-b border-gray-800 bg-gray-950 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="font-bold text-white tracking-tight">
                <span className="text-green-400">Pulse</span>BMC
              </Link>
              <div className="flex items-center gap-4 text-sm">
                <Link id="fleet-nav" href="/" className="text-gray-400 hover:text-white transition-colors">Fleet</Link>
                <Link id="alerts-nav" href="/alerts" className="text-gray-400 hover:text-white transition-colors">Alerts</Link>
                <Link id="explore-nav" href="/explore" className="text-gray-400 hover:text-white transition-colors">Explorer</Link>
                <Link href="/architecture" className="text-gray-400 hover:text-white transition-colors flex items-center gap-1">
                  <span className="text-emerald-400 text-[10px]">◈</span> How It Works
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <LiveClock />
              <div id="atlas-badge" className="text-xs text-gray-500 border border-gray-700 rounded px-2 py-1">
                <span className="text-green-400">●</span> Atlas: back-to-basics-crud
              </div>
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
