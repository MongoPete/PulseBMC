"use client";
import { useEffect, useState } from "react";

/** Live browser clock so timestamps on the page have a real-time reference. */
export default function LiveClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Render nothing until mounted to avoid a server/client hydration mismatch
  if (!now) return <span className="text-xs text-slate-400 tabular-nums">--:--:--</span>;

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-400 tabular-nums" title={tz}>
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#009999" }} />
      {now.toLocaleTimeString()}
    </span>
  );
}
