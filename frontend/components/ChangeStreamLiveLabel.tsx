"use client";

interface Props {
  connected: boolean;
  compact?: boolean;
}

/** MongoDB Change Stream → SSE — Aaron pitch moment #4. */
export default function ChangeStreamLiveLabel({ connected, compact = false }: Props) {
  const title =
    "MongoDB Change Stream (≈ SQL TRIGGER / LISTEN-NOTIFY) pushes insert/update events to the browser via SSE";

  if (compact) {
    return (
      <span className="flex items-center gap-1.5" title={title}>
        <span
          className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-slate-300"}`}
        />
        <span className="text-slate-500">
          {connected ? "Change Stream → SSE" : "Connecting…"}
        </span>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1.5 text-[10px] text-slate-600" title={title}>
      <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-gray-600"}`} />
      {connected ? "Change Stream → SSE" : "connecting…"}
    </span>
  );
}
