"use client";
import { useState } from "react";

interface Props {
  doc: Record<string, unknown>;
  title?: string;
}

const SQL_ANNOTATIONS: Record<string, string> = {
  device_id: "Foreign key → devices table",
  pattern_id: "Foreign key → test_patterns table",
  started_at: "Timestamp column",
  status: "Enum column (pass/fail)",
  led_state: "Derived status column",
  duration_ms: "Numeric column",
  results: "Embedded child table → no JOIN needed",
  "results.components": "Array of child rows — in SQL: separate table with device_id FK",
  embedding: "Vector column (1024 floats) → Atlas Vector Search index",
  triggered_by: "Audit column",
};

function AnnotatedValue({ fieldKey, value }: { fieldKey: string; value: unknown }) {
  const annotation = SQL_ANNOTATIONS[fieldKey];
  if (typeof value === "object" && value !== null) {
    return (
      <span className="text-gray-300">
        {Array.isArray(value) ? `[${(value as unknown[]).length} items]` : "{...}"}
        {annotation && <span className="text-gray-400 ml-2 text-xs">← {annotation}</span>}
      </span>
    );
  }
  return (
    <span>
      <span className={typeof value === "string" ? "text-green-300" : "text-yellow-300"}>
        {JSON.stringify(value)}
      </span>
      {annotation && <span className="text-gray-400 ml-2 text-xs">← {annotation}</span>}
    </span>
  );
}

export default function DocumentViewer({ doc, title = "Live MongoDB Document" }: Props) {
  const [open, setOpen] = useState(false);

  const displayDoc = { ...doc };
  if (Array.isArray(displayDoc.embedding)) {
    displayDoc.embedding = `[${(displayDoc.embedding as number[]).length} floats — vector index]` as unknown as number[];
  }

  return (
    <div id="doc-viewer" className="border border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-900 hover:bg-gray-800 text-sm transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-yellow-400 font-mono">{"{}"}</span>
          <span className="text-gray-300">{title}</span>
          <span className="text-gray-400 text-xs">— like a SQL row, but nested</span>
        </span>
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="bg-gray-950 p-3">
          <p className="text-xs text-gray-300 mb-2">
            Hover over any field to see its SQL equivalent. The <span className="text-yellow-300 font-medium">embedding</span> field
            is the 1,024-dim vector Atlas uses for semantic search — no equivalent in SQL.
          </p>
          <div className="font-mono text-xs space-y-0.5">
            {Object.entries(displayDoc).map(([k, v]) => (
              <div key={k} className="flex items-start gap-2">
                <span className="text-blue-400 shrink-0">{k}:</span>
                <AnnotatedValue key={k} fieldKey={k} value={v} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
