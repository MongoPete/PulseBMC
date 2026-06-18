import Image from "next/image";
import { SIEMENS_PETROL } from "@/lib/theme";

/** Official Siemens wordmark (petrol on transparent). `size` is height in px; width scales with asset aspect ratio. */
export function SiemensWordmark({ size = 12 }: { size?: number }) {
  const w = Math.round(size * (1180 / 224));
  return (
    <Image
      src="/siemens-logo-petrol.png"
      alt="Siemens"
      width={w}
      height={size}
      className="shrink-0"
    />
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
