"use client";

type LedState = "green" | "flashing_green" | "red" | "off";

interface Props {
  state: LedState;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const SIZE = { sm: "w-3 h-3", md: "w-5 h-5", lg: "w-8 h-8" };

export default function LedIndicator({ state, size = "md", label }: Props) {
  const base = `${SIZE[size]} rounded-full inline-block`;

  const classes: Record<LedState, string> = {
    green: `${base} bg-green-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.6)]`,
    flashing_green: `${base} bg-green-400 shadow-[0_0_8px_2px_rgba(74,222,128,0.6)] animate-pulse`,
    red: `${base} bg-red-500 shadow-[0_0_10px_3px_rgba(239,68,68,0.7)] animate-pulse`,
    off: `${base} bg-gray-700`,
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={classes[state]} title={label ?? state} />
      {label && <span className="text-xs text-gray-400">{label}</span>}
    </span>
  );
}
