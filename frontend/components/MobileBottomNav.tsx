"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SIEMENS_PETROL = "#009999";
const SIEMENS_DARK = "#000028";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Fleet",
    shortLabel: "Fleet",
    id: "fleet-nav",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/alerts",
    label: "Alerts",
    shortLabel: "Alerts",
    id: "alerts-nav",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    href: "/explore",
    label: "Explorer",
    shortLabel: "Explore",
    id: "explore-nav",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.3-4.3" />
      </svg>
    ),
  },
  {
    href: "/architecture",
    label: "How It Works",
    shortLabel: "Guide",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  if (pathname === "/login" || pathname === "/setup") return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800"
      style={{
        background: SIEMENS_DARK,
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      aria-label="Primary navigation"
    >
      <div className="grid grid-cols-4 h-16">
        {NAV_ITEMS.map(({ href, shortLabel, id, icon }) => {
          const active = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              id={id}
              href={href}
              className="relative flex flex-col items-center justify-center gap-0.5 min-h-[48px] transition-colors"
              style={{ color: active ? SIEMENS_PETROL : "#94a3b8" }}
            >
              {active && (
                <span
                  className="absolute top-0 inset-x-3 h-0.5 rounded-full"
                  style={{ background: SIEMENS_PETROL }}
                />
              )}
              {icon}
              <span className="text-[10px] font-semibold leading-none">{shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
