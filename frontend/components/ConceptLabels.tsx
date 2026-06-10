import type { ReactNode } from "react";
import { SIEMENS_PETROL } from "@/lib/theme";

export function MongoLabel({ children = "MongoDB" }: { children?: ReactNode }) {
  return (
    <span className="text-[10px] font-mono font-semibold uppercase tracking-wide text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0">
      {children}
    </span>
  );
}

export function SqlLabel({ children = "SQL" }: { children?: ReactNode }) {
  return (
    <span className="text-[10px] font-mono font-semibold uppercase tracking-wide text-blue-800 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded shrink-0">
      {children}
    </span>
  );
}

export function PanelAccentBar() {
  return <div className="h-0.5 w-full shrink-0" style={{ background: SIEMENS_PETROL }} />;
}
