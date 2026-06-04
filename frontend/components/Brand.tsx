import { SIEMENS_PETROL } from "@/lib/theme";

export function SiemensWordmark({ size = 12 }: { size?: number }) {
  return (
    <span
      style={{
        fontFamily: "Arial, sans-serif",
        fontWeight: 700,
        letterSpacing: "0.18em",
        fontSize: `${size}px`,
        color: SIEMENS_PETROL,
        textTransform: "uppercase",
      }}
    >
      SIEMENS
    </span>
  );
}

export function SoCPulseWordmark({ className = "text-sm" }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight text-slate-800 ${className}`}>
      SoC<span style={{ color: SIEMENS_PETROL }}>Pulse</span>
    </span>
  );
}

/** Siemens × SoCPulse co-brand lockup. siemensSize pins both wordmarks to the same pixel size. */
export function BrandLockup({
  wordmarkClass = "text-sm",
  siemensSize,
}: {
  wordmarkClass?: string;
  siemensSize?: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <SiemensWordmark size={siemensSize} />
      <span className="text-slate-300 text-sm">×</span>
      <SoCPulseWordmark className={wordmarkClass} />
    </div>
  );
}
