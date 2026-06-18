"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import LiveClock from "@/components/LiveClock";
import { SiemensWordmark } from "@/components/Brand";

// Siemens corporate dark (#000028) header — matches TeamCenter / siemens.com nav
const SIEMENS_DARK = "#000028";
const SIEMENS_PETROL = "#009999";
const MONGODB_GREEN = "#00ED64";

export default function TopNav() {
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/setup") return null;

  const onSignOut = () => {
    signOut({ callbackUrl: "/login" });
  };

  const navLink = (href: string, label: string, id?: string) => {
    const active = pathname === href || (href !== "/" && pathname.startsWith(href));
    return (
      <Link
        id={id}
        href={href}
        className={`text-sm transition-colors font-medium ${
          active ? "text-white" : "text-slate-300 hover:text-white"
        }`}
        style={active ? { borderBottom: `2px solid ${SIEMENS_PETROL}`, paddingBottom: "2px" } : {}}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav
      className="sticky top-0 z-40"
      style={{
        background: SIEMENS_DARK,
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 h-12 flex items-center justify-between gap-2">
        {/* Brand — compact on phone, full lockup on sm+ */}
        <Link href="/" className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
          <span className="hidden sm:inline-block shrink-0 leading-none">
            <SiemensWordmark size={16} />
          </span>
          <span className="hidden sm:inline text-slate-500 text-sm">×</span>
          <span
            style={{
              fontFamily: "Arial, sans-serif",
              fontWeight: 700,
              fontSize: "14px",
              color: "#ffffff",
              letterSpacing: "-0.01em",
            }}
          >
            SoC<span style={{ color: SIEMENS_PETROL }}>Pulse</span>
          </span>
        </Link>

        {/* Desktop nav links — bottom tab bar on mobile */}
        <div className="hidden md:flex items-center gap-5 flex-1 justify-center">
          {navLink("/", "Fleet", "fleet-nav")}
          {navLink("/alerts", "Alerts", "alerts-nav")}
          {navLink("/explore", "Explorer", "explore-nav")}
          {navLink("/architecture", "How It Works")}
        </div>

        {/* Right: Atlas badge, clock, sign out */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="md:hidden flex items-center gap-1" title="Powered by MongoDB Atlas">
            <span style={{ color: MONGODB_GREEN, fontSize: "10px" }}>●</span>
            <span className="text-[10px] font-bold" style={{ color: MONGODB_GREEN }}>Atlas</span>
          </div>
          <div className="hidden lg:block">
            <LiveClock dark />
          </div>

          <div className="hidden md:flex items-center gap-1.5 border-l border-slate-700 pl-4">
            <span style={{ color: MONGODB_GREEN, fontSize: "10px" }}>●</span>
            <span className="text-xs text-slate-300">Powered by</span>
            <span className="text-sm font-bold" style={{ color: MONGODB_GREEN }}>
              MongoDB Atlas
            </span>
          </div>

          <button
            onClick={onSignOut}
            className="text-xs text-slate-400 hover:text-white transition-colors border border-slate-700 rounded px-2.5 py-1.5 min-h-[36px] hover:border-slate-500"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
