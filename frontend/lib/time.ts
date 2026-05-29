/**
 * The backend stores naive UTC timestamps (Python datetime.utcnow()), which
 * serialize without a timezone marker, e.g. "2026-05-29T15:43:51.946000".
 * JavaScript's Date parses such date-time strings as LOCAL time, so the value
 * ends up shifted by the browser's UTC offset. These helpers force UTC parsing
 * and then render in the browser's local timezone — accurate either way.
 */

/** Parse a server timestamp, treating tz-less strings as UTC. */
export function parseServerDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  let s = iso.trim();
  // Already has a timezone (Z or ±HH:MM)? Use as-is.
  const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s);
  if (!hasTz) {
    // Date-time form without tz → mark as UTC.
    s = s.includes("T") ? `${s}Z` : `${s.replace(" ", "T")}Z`;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** Local time, e.g. "11:43:51 AM". */
export function fmtTime(iso: string | null | undefined): string {
  const d = parseServerDate(iso);
  return d ? d.toLocaleTimeString() : "—";
}

/** Local date + time, e.g. "5/29/2026, 11:43:51 AM". */
export function fmtDateTime(iso: string | null | undefined): string {
  const d = parseServerDate(iso);
  return d ? d.toLocaleString() : "—";
}

/** Short local time for charts, e.g. "11:43". */
export function fmtClock(iso: string | null | undefined): string {
  const d = parseServerDate(iso);
  return d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—";
}

/** Compact relative age, e.g. "3s ago", "5m ago", "2h ago". */
export function fmtRelative(iso: string | null | undefined): string {
  const d = parseServerDate(iso);
  if (!d) return "—";
  const secs = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
