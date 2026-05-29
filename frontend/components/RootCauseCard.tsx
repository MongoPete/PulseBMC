"use client";

interface RootCause {
  alert_id: string;
  root_cause_hypothesis: string;
  evidence: string[];
  confidence: number;
  alternative_hypotheses: string[];
  next_diagnostic_steps: string[];
  retrieved_context_summary: string;
}

export default function RootCauseCard({ rca }: { rca: RootCause }) {
  const confidencePct = Math.round(rca.confidence * 100);
  const confidenceColor =
    confidencePct >= 70 ? "bg-emerald-500" :
    confidencePct >= 40 ? "bg-amber-500" : "bg-rose-500";
  const confidenceLabel =
    confidencePct >= 70 ? "text-emerald-400" :
    confidencePct >= 40 ? "text-amber-400" : "text-rose-400";

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between gap-2 mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Root Cause</p>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className={`text-sm font-mono font-semibold ${confidenceLabel}`}>{confidencePct}%</span>
            <span className="text-xs text-slate-400">confidence</span>
          </div>
        </div>
        <p className="text-sm text-slate-100 leading-relaxed">{rca.root_cause_hypothesis}</p>
      </div>

      {/* Confidence bar */}
      <div className="px-5 pb-4">
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${confidenceColor}`}
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>

      {/* Retrieved context */}
      {rca.retrieved_context_summary && (
        <div className="mx-5 mb-4 px-3 py-2.5 rounded-lg bg-indigo-950/30 border border-indigo-900/40">
          <p className="text-xs text-indigo-300/90 leading-relaxed">
            <span className="text-indigo-400 font-semibold">Vector context: </span>
            {rca.retrieved_context_summary}
          </p>
        </div>
      )}

      {/* Evidence */}
      {rca.evidence.length > 0 && (
        <div className="px-5 pb-4 border-t border-slate-800/60 pt-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Evidence</p>
          <ul className="space-y-2.5">
            {rca.evidence.map((e, i) => (
              <li key={i} className="flex gap-2.5 leading-relaxed">
                <span className="text-slate-400 shrink-0 mt-0.5 text-sm">–</span>
                <span className="text-sm text-slate-300">{e}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next steps */}
      {rca.next_diagnostic_steps.length > 0 && (
        <div className="px-5 pb-5 border-t border-slate-800/60 pt-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Next Diagnostic Steps</p>
          <ol className="space-y-2.5">
            {rca.next_diagnostic_steps.map((step, i) => (
              <li key={i} className="flex gap-2.5 leading-relaxed">
                <span className="text-slate-400 shrink-0 font-mono text-sm w-5 text-right">{i + 1}.</span>
                <span className="text-sm text-slate-300">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
