"use client";

import { useState } from "react";
import { styles, badge } from "@/components/ui/table-classes";

// Debug panel rendered under assistant messages (admin-only).
// Shows which retrieval arm surfaced each chunk and the top-of-chunk text,
// so a human can see at a glance whether the answer was grounded in the
// expected sources.

type DebugSource = {
  source_title?: string;
  source_type?: string;
  chunk_text?: string;
  chunk_index?: number;
  rank?: number;
  retrieved_via?: string;
  /**
   * Per-sheet count of cells with Excel formulas that have no cached value.
   * Populated during xlsx ingest; surfaced here so the user knows the file
   * needs to be opened in Excel + re-saved to recompute formulas.
   */
  formula_warnings?: Record<string, number>;
};

function totalFormulaWarnings(fw: Record<string, number> | undefined): number {
  if (!fw) return 0;
  let sum = 0;
  for (const n of Object.values(fw)) sum += Number(n) || 0;
  return sum;
}

const VIA_LABEL: Record<string, string> = {
  hybrid: "Hybrid (FTS+Vec+Trgm)",
  expansion: "Expansion (Multi-Query)",
  boost: "Boosted",
  operational: "CRM-Tabelle",
  listing: "Listing",
  fallback: "Fallback",
};

function viaColor(via: string | undefined): string {
  switch (via) {
    case "listing":
      return "var(--color-accent)";
    case "operational":
      return "#7c3aed"; // violet
    case "boost":
      return "#f59e0b"; // amber
    case "expansion":
      return "#0ea5e9"; // sky
    case "fallback":
      return "#6b7280"; // gray
    case "hybrid":
    default:
      return "#2563eb"; // blue
  }
}

export default function RetrievalDebug({
  sources,
}: {
  sources: DebugSource[];
}) {
  const [open, setOpen] = useState(false);

  if (!sources || sources.length === 0) return null;

  return (
    <div
      className="mt-2 rounded-xl border text-xs"
      style={{
        borderColor: "var(--color-line-soft)",
        background: "var(--color-bg-elevated)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left min-h-[36px]"
        style={{ color: "var(--color-muted)" }}
      >
        <span className="font-medium">
          Chat-Diagnose · {sources.length} Chunk{sources.length === 1 ? "" : "s"} verwendet
        </span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div
          className="px-3 pb-3 pt-1 overflow-x-auto"
          style={{ borderTop: "1px solid var(--color-line-soft)" }}
        >
          <table className="w-full text-left border-collapse">
            <thead>
              <tr style={{ color: "var(--color-muted)" }}>
                <th className="py-1 pr-2 font-medium">#</th>
                <th className="py-1 pr-2 font-medium">Quelle</th>
                <th className="py-1 pr-2 font-medium">Via</th>
                <th className="py-1 pr-2 font-medium">Rank</th>
                <th className="py-1 font-medium">Text</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s, i) => {
                const text = (s.chunk_text ?? "").slice(0, 200);
                const viaKey = s.retrieved_via ?? "hybrid";
                return (
                  <tr
                    key={`dbg-${i}`}
                    style={{ borderTop: "1px solid var(--color-line-soft)" }}
                  >
                    <td
                      className="py-1.5 pr-2 align-top"
                      style={{ color: "var(--color-muted)" }}
                    >
                      {i + 1}
                    </td>
                    <td
                      className="py-1.5 pr-2 align-top max-w-[200px]"
                      style={{ color: "var(--color-text)" }}
                    >
                      <div className="truncate">{s.source_title ?? "—"}</div>
                      {s.source_type && (
                        <div className="text-[10px]" style={styles.muted}>
                          {s.source_type}
                          {typeof s.chunk_index === "number" &&
                            ` · #${s.chunk_index}`}
                        </div>
                      )}
                      {(() => {
                        const warnCount = totalFormulaWarnings(s.formula_warnings);
                        if (warnCount === 0) return null;
                        const sheetCount = Object.keys(s.formula_warnings ?? {}).length;
                        const tooltip = Object.entries(s.formula_warnings ?? {})
                          .map(([sheet, n]) => `${sheet}: ${n}`)
                          .join("\n");
                        return (
                          <div
                            className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                            style={{
                              background: "var(--color-warning-soft)",
                              color: "var(--color-warning)",
                              border: "1px solid var(--color-warning)",
                            }}
                            title={`Formeln ohne cached Value – Datei in Excel öffnen und neu speichern:\n${tooltip}`}
                          >
                            ⚠ {warnCount} Formel{warnCount === 1 ? "" : "n"} unberechnet
                            {sheetCount > 1 && ` (${sheetCount} Sheets)`}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-1.5 pr-2 align-top">
                      <span
                        className={badge.pill}
                        style={{
                          background: viaColor(viaKey),
                          color: "#fff",
                          fontSize: "10px",
                        }}
                      >
                        {VIA_LABEL[viaKey] ?? viaKey}
                      </span>
                    </td>
                    <td
                      className="py-1.5 pr-2 align-top font-mono"
                      style={{ color: "var(--color-muted)" }}
                    >
                      {typeof s.rank === "number" ? s.rank.toFixed(4) : "—"}
                    </td>
                    <td
                      className="py-1.5 align-top"
                      style={{ color: "var(--color-text)" }}
                    >
                      <div className="line-clamp-3 whitespace-pre-wrap">
                        {text}
                        {(s.chunk_text ?? "").length > 200 && "…"}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
