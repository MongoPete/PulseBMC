"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import LiveClock from "@/components/LiveClock";
import { signOut } from "@/components/AuthGate";

// Siemens corporate dark (#000028) header — matches TeamCenter / siemens.com nav
const SIEMENS_DARK = "#000028";
const SIEMENS_PETROL = "#009999";
const MONGODB_GREEN = "#00ED64";

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === "/login") return null;

  const onSignOut = () => {
    signOut();
    router.replace("/login");
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
    <nav className="sticky top-0 z-40" style={{ background: SIEMENS_DARK }}>
      <div className="max-w-7xl mx-auto px-4 h-12 flex items-center justify-between">
        {/* Left: Brand + nav links */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            {/* SIEMENS wordmark — same size/weight as SoCPulse */}
            <span style={{
              fontFamily: "Arial, sans-serif",
              fontWeight: 700,
              letterSpacing: "0.18em",
              fontSize: "14px",
              color: SIEMENS_PETROL,
              textTransform: "uppercase",
            }}>
              SIEMENS
            </span>
            <span className="text-slate-500 text-sm">×</span>
            <span style={{
              fontFamily: "Arial, sans-serif",
              fontWeight: 700,
              fontSize: "14px",
              color: "#ffffff",
              letterSpacing: "-0.01em",
            }}>
              SoC<span style={{ color: SIEMENS_PETROL }}>Pulse</span>
            </span>
          </Link>

          <div className="flex items-center gap-5">
            {navLink("/", "Fleet", "fleet-nav")}
            {navLink("/alerts", "Alerts", "alerts-nav")}
            {navLink("/explore", "Explorer", "explore-nav")}
            {navLink("/architecture", "How It Works")}
          </div>
        </div>

        {/* Right: Atlas badge, clock, sign out */}
        <div className="flex items-center gap-4">
          <LiveClock dark />

          {/* Powered by MongoDB Atlas */}
          <div className="flex items-center gap-1.5 border-l border-slate-700 pl-4">
            <span style={{ color: MONGODB_GREEN, fontSize: "10px" }}>●</span>
            <span className="text-xs text-slate-300">Powered by</span>
            <span className="text-sm font-bold" style={{ color: MONGODB_GREEN }}>MongoDB Atlas</span>
          </div>

          <button
            onClick={onSignOut}
            className="text-xs text-slate-400 hover:text-white transition-colors border border-slate-700 rounded px-2.5 py-1 hover:border-slate-500"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
