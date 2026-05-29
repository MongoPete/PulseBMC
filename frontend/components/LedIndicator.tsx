"use client";

export type LedState = "green" | "flashing_green" | "red" | "off" | "amber";

interface Props {
  state: LedState;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const SIZE = { sm: "w-3 h-3", md: "w-5 h-5", lg: "w-8 h-8" };

export default function LedIndicator({ state, size = "md", label }: Props) {
  const base = `${SIZE[size]} rounded-full inline-block shrink-0`;

  const classes: Record<LedState, string> = {
    green: `${base} bg-green-500 shadow-[0_0_5px_1px_rgba(34,197,94,0.45)]`,
    flashing_green: `${base} bg-green-500 shadow-[0_0_5px_1px_rgba(34,197,94,0.45)] animate-pulse`,
    amber: `${base} bg-amber-400 amber-blink`,
    red: `${base} bg-red-600 shadow-[0_0_4px_1px_rgba(220,38,38,0.4)]`,
    off: `${base} bg-slate-300`,
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={classes[state]} title={label ?? state} />
      {label && <span className="text-xs text-slate-500">{label}</span>}
    </span>
  );
}
