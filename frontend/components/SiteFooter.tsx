"use client";

import { usePathname } from "next/navigation";
import { SiemensWordmark } from "@/components/Brand";
import { SIEMENS_DARK, SIEMENS_PETROL, MONGODB_GREEN } from "@/lib/theme";

export default function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <footer className="hidden md:block" style={{ background: SIEMENS_DARK, borderTop: "1px solid #1a1a3e" }}>
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        {/* Brand lockup */}
        <div className="flex items-center gap-3">
          <span className="inline-block shrink-0 leading-none">
            <SiemensWordmark size={12} />
          </span>
          <span className="text-slate-600 text-xs">×</span>
          <span style={{ fontFamily: "Arial, sans-serif", fontWeight: 700, fontSize: "11px", color: "#fff" }}>
            SoC<span style={{ color: SIEMENS_PETROL }}>Pulse</span>
          </span>
        </div>

        {/* Powered by MongoDB Atlas — centred */}
        <div
          className="flex items-center gap-1.5 text-xs rounded-full px-3 py-1 border"
          style={{ borderColor: `${MONGODB_GREEN}44`, background: `${MONGODB_GREEN}11` }}
        >
          <span style={{ color: MONGODB_GREEN, fontSize: "9px" }}>●</span>
          <span className="text-slate-300">Powered by</span>
          <span className="font-bold" style={{ color: MONGODB_GREEN }}>MongoDB Atlas</span>
        </div>

        {/* Right: product name */}
        <span className="text-xs text-slate-600">SoCPulse · SoC Fleet Health Monitoring</span>
      </div>
    </footer>
  );
}
