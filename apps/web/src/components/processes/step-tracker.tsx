"use client";

import { useTransition } from "react";
import type { ProcessInstanceStep } from "@/lib/db/queries/processes";
import { updateProcessStep } from "@/app/actions";
import { badge } from "@/components/ui/table-classes";

const STEP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Ausstehend", color: "var(--color-muted)", bg: "var(--color-bg-elevated)" },
  in_progress: { label: "In Bearbeitung", color: "var(--color-info)", bg: "var(--color-info-soft)" },
  completed: { label: "Erledigt", color: "var(--color-success)", bg: "var(--color-success-soft)" },
  skipped: { label: "Uebersprungen", color: "var(--color-placeholder)", bg: "var(--color-bg-elevated)" },
};

export function StepTracker({
  steps,
  instanceId,
}: {
  steps: ProcessInstanceStep[];
  instanceId: string;
}) {
  const [isPending, startTransition] = useTransition();

  function handleStatusChange(stepId: string, newStatus: string) {
    startTransition(async () => {
      await updateProcessStep(stepId, instanceId, newStatus);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
        Schritte
      </h2>
      <div className="flex flex-col gap-0">
        {steps.map((step, i) => {
          const config = STEP_STATUS[step.status] ?? STEP_STATUS.pending;
          const isLast = i === steps.length - 1;

          return (
            <div key={step.id} className="flex gap-3">
              {/* Timeline indicator */}
              <div className="flex flex-col items-center">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: config.bg, color: config.color }}
                >
                  {step.status === "completed" ? "✓" : step.step_order}
                </div>
                {!isLast && (
                  <div
                    className="w-px flex-1 min-h-[16px]"
                    style={{ background: "var(--color-line)" }}
                  />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 pb-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--color-text)" }}
                    >
                      {step.name}
                    </span>
                    <span
                      className={badge.pill}
                      style={{ background: config.bg, color: config.color, fontSize: "10px" }}
                    >
                      {config.label}
                    </span>
                  </div>

                  {/* Status actions */}
                  <div className="flex gap-1">
                    {step.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(step.id, "in_progress")}
                        disabled={isPending}
                        className="text-xs px-2 py-1 rounded min-h-[28px] transition-all"
                        style={{
                          background: "var(--color-info-soft)",
                          color: "var(--color-info)",
                        }}
                      >
                        Starten
                      </button>
                    )}
                    {step.status === "in_progress" && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(step.id, "completed")}
                        disabled={isPending}
                        className="text-xs px-2 py-1 rounded min-h-[28px] transition-all"
                        style={{
                          background: "var(--color-success-soft)",
                          color: "var(--color-success)",
                        }}
                      >
                        Abschliessen
                      </button>
                    )}
                    {(step.status === "pending" || step.status === "in_progress") && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(step.id, "skipped")}
                        disabled={isPending}
                        className="text-xs px-2 py-1 rounded min-h-[28px] transition-all"
                        style={{
                          background: "var(--color-bg-elevated)",
                          color: "var(--color-placeholder)",
                        }}
                      >
                        Ueberspringen
                      </button>
                    )}
                  </div>
                </div>

                {/* Dates */}
                {(step.started_at || step.completed_at) && (
                  <div className="flex gap-3 mt-1 text-[11px]" style={{ color: "var(--color-placeholder)" }}>
                    {step.started_at && (
                      <span>Gestartet: {new Date(step.started_at).toLocaleString("de-DE")}</span>
                    )}
                    {step.completed_at && (
                      <span>Abgeschlossen: {new Date(step.completed_at).toLocaleString("de-DE")}</span>
                    )}
                  </div>
                )}

                {step.notes && (
                  <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                    {step.notes}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
