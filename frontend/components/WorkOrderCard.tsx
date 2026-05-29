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

const PRIORITY_META: Record<string, { label: string; dot: string; text: string }> = {
  P1: { label: "P1 · Critical",  dot: "bg-rose-400",   text: "text-rose-300" },
  P2: { label: "P2 · High",      dot: "bg-amber-400",  text: "text-amber-300" },
  P3: { label: "P3 · Medium",    dot: "bg-yellow-400", text: "text-yellow-300" },
  P4: { label: "P4 · Low",       dot: "bg-sky-400",    text: "text-sky-300" },
};

export default function WorkOrderCard({ wo }: { wo: WorkOrder }) {
  const meta = PRIORITY_META[wo.priority] ?? PRIORITY_META.P2;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Work Order</p>
          <span className={`flex items-center gap-1.5 text-xs font-semibold ${meta.text} shrink-0`}>
            <span className={`w-2 h-2 rounded-full ${meta.dot} inline-block`} />
            {meta.label}
          </span>
        </div>
        <p className="text-sm font-medium text-slate-100 leading-snug">{wo.title}</p>
        <p className="text-xs text-slate-300 mt-1.5">→ {wo.assigned_technician}</p>
      </div>

      {/* Historical basis */}
      {wo.historical_basis && (
        <div className="mx-5 mb-4 px-3 py-2.5 rounded-lg bg-indigo-950/30 border border-indigo-900/40">
          <p className="text-xs text-indigo-300/90 leading-relaxed">
            <span className="text-indigo-400 font-semibold">Historical basis: </span>
            {wo.historical_basis}
          </p>
        </div>
      )}

      {/* Repair steps */}
      {wo.repair_steps.length > 0 && (
        <div className="px-5 pb-4 border-t border-slate-800/60 pt-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Repair Steps</p>
          <ol className="space-y-3">
            {wo.repair_steps.map((step, i) => {
              const isDestructive = /destructive|offline|reseat|power.?off/i.test(step);
              return (
                <li key={i} className="flex gap-2.5 leading-relaxed">
                  <span className="text-slate-400 shrink-0 font-mono text-sm w-5 text-right">{i + 1}.</span>
                  <span className={`text-sm ${isDestructive ? "text-amber-300" : "text-slate-300"}`}>
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
        <div className="mx-5 mb-4 px-3 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700/40 space-y-1.5">
          {wo.safety_notes.map((note, i) => (
            <p key={i} className="text-xs text-amber-300/80 leading-relaxed">
              ⚠ {note}
            </p>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="px-5 pb-4 pt-2 flex items-center justify-between text-xs text-slate-500 border-t border-slate-800/60">
        <span>Est. {wo.estimated_duration_minutes} min</span>
        <span className="font-mono">alert …{wo.originating_alert_id.slice(-6)}</span>
      </div>
    </div>
  );
}
