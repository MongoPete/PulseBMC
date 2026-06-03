"use client";

interface WorkOrder {
  title: string;
  priority: "P1" | "P2" | "P3" | "P4";
  assigned_technician: string;
  repair_steps: string[];
  estimated_duration_minutes: number;
  required_parts: string[];
  safety_notes: string[];
  historical_basis: string;
  originating_alert_id: string;
}

interface DeviceInfo {
  hostname?: string;
  location?: { datacenter?: string; rack?: string; slot?: string };
  hardware?: { model?: string; pcie_slots?: number };
}

const PRIORITY_META: Record<string, { label: string; dot: string; text: string; bg: string }> = {
  P1: { label: "P1 · Critical", dot: "bg-red-500",    text: "text-red-700",    bg: "bg-red-50 border-red-200" },
  P2: { label: "P2 · High",     dot: "bg-amber-500",  text: "text-amber-700",  bg: "bg-amber-50 border-amber-200" },
  P3: { label: "P3 · Medium",   dot: "bg-yellow-500", text: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  P4: { label: "P4 · Low",      dot: "bg-slate-400",  text: "text-slate-600",  bg: "bg-slate-50 border-slate-200" },
};

export default function WorkOrderCard({ wo, deviceInfo }: { wo: WorkOrder; deviceInfo?: DeviceInfo }) {
  const meta = PRIORITY_META[wo.priority] ?? PRIORITY_META.P2;

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
      {/* Dispatch header — location first, like a physical ticket */}
      <div className={`px-5 py-3 border-b border-slate-100 ${meta.bg} border`}>
        <div className="flex items-center justify-between gap-2">
          <div>
            {deviceInfo?.location ? (
              <>
                <p className="text-xs font-bold text-slate-700 font-mono">
                  {[deviceInfo.location.datacenter, deviceInfo.location.rack,
                    deviceInfo.location.slot ? `Slot ${deviceInfo.location.slot}` : null]
                    .filter(Boolean).join(" › ")}
                </p>
                {deviceInfo.hardware?.model && (
                  <p className="text-[11px] text-slate-500 mt-0.5">{deviceInfo.hardware.model}</p>
                )}
              </>
            ) : (
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Work Order</p>
            )}
          </div>
          <span className={`flex items-center gap-1.5 text-xs font-semibold ${meta.text} shrink-0`}>
            <span className={`w-2 h-2 rounded-full ${meta.dot} inline-block`} />
            {meta.label}
          </span>
        </div>
      </div>

      {/* Title + technician */}
      <div className="px-5 pt-4 pb-3">
        <p className="text-sm font-semibold text-slate-800 leading-snug">{wo.title}</p>
        <p className="text-xs text-slate-500 mt-1">→ {wo.assigned_technician}</p>
      </div>

      {/* Historical basis */}
      {wo.historical_basis && (
        <div className="mx-5 mb-4 px-3 py-2 rounded bg-slate-50 border border-slate-200">
          <p className="text-xs text-slate-600 leading-relaxed">
            <span className="font-semibold text-slate-700">Based on: </span>
            {wo.historical_basis}
          </p>
        </div>
      )}

      {/* Repair steps */}
      {wo.repair_steps.length > 0 && (
        <div className="px-5 pb-4 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Repair Steps</p>
          <ol className="space-y-2.5">
            {wo.repair_steps.map((step, i) => {
              const isDestructive = /destructive|offline|reseat|power.?off/i.test(step);
              return (
                <li key={i} className="flex gap-2.5 leading-relaxed">
                  <span className="text-slate-400 shrink-0 font-mono text-sm w-5 text-right">{i + 1}.</span>
                  <span className={`text-sm ${isDestructive ? "text-amber-700" : "text-slate-700"}`}>
                    {step}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Safety notes */}
      {wo.safety_notes.length > 0 && (
        <div className="mx-5 mb-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
          {wo.safety_notes.map((note, i) => (
            <p key={i} className="text-xs text-amber-700 leading-relaxed">⚠ {note}</p>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="px-5 pb-4 pt-2 flex items-center justify-between text-xs text-slate-400 border-t border-slate-100">
        <span>Est. {wo.estimated_duration_minutes} min</span>
        <span className="font-mono">alert …{wo.originating_alert_id.slice(-6)}</span>
      </div>
    </div>
  );
}
