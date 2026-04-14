"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

type Props = {
  status: string;
  done: number;
  total: number;
};

// Polls the RSC every 2.5s while the source is still being embedded.
// Server component reads fresh `sources.embed_jobs_*` each refresh, so
// the progress bar below visually advances without realtime subscriptions.
export function ProcessingProgress({ status, done, total }: Props) {
  const router = useRouter();
  const isProcessing = status !== "ready" && status !== "error";

  useEffect(() => {
    if (!isProcessing) return;
    const id = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(id);
  }, [isProcessing, router]);

  if (!isProcessing) return null;

  // total === 0 means either legacy data or a source that hasn't enqueued
  // anything yet — fall back to an indeterminate state.
  const hasTotal = total > 0;
  const percent = hasTotal ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div
      className="rounded-[var(--radius-card)] p-4 md:p-5 border flex flex-col gap-3 animate-fade-in"
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-line)",
      }}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2.5 h-2.5 rounded-full animate-pulse"
            style={{ background: "var(--color-accent)" }}
            aria-hidden
          />
          <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Verarbeitung läuft
          </span>
        </div>
        <span className="text-xs" style={{ color: "var(--color-muted)" }}>
          {hasTotal ? `${done} von ${total} Teilen • ${percent} %` : "Wird vorbereitet…"}
        </span>
      </div>
      <div
        className="w-full h-2 rounded-full overflow-hidden"
        style={{ background: "var(--color-accent-soft)" }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={hasTotal ? percent : undefined}
      >
        <div
          className="h-full transition-all duration-500"
          style={{
            width: hasTotal ? `${percent}%` : "35%",
            background: "var(--color-accent)",
          }}
        />
      </div>
      <p className="text-xs" style={{ color: "var(--color-muted)" }}>
        Die Seite aktualisiert sich automatisch. Bis alle Teile verarbeitet sind, kann sich die Anzahl der Abschnitte noch ändern.
      </p>
    </div>
  );
}
