import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getInstanceById,
  getInstanceSteps,
  getProcessAnalysis,
  getTemplateById,
} from "@/lib/db/queries/processes";
import { deleteProcessInstance } from "@/app/actions";
import { StepTracker } from "@/components/processes/step-tracker";
import { card, badge, btn, page, styles } from "@/components/ui/table-classes";

export const dynamic = "force-dynamic";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Aktiv", color: "var(--color-success)", bg: "var(--color-success-soft)" },
  completed: { label: "Abgeschlossen", color: "var(--color-accent)", bg: "var(--color-accent-soft)" },
  paused: { label: "Pausiert", color: "var(--color-warning)", bg: "var(--color-warning-soft)" },
  cancelled: { label: "Abgebrochen", color: "var(--color-danger)", bg: "var(--color-danger-soft)" },
};

export default async function ProcessInstancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [instance, steps, analysis] = await Promise.all([
    getInstanceById(id),
    getInstanceSteps(id),
    getProcessAnalysis(id),
  ]);
  if (!instance) notFound();

  const template = await getTemplateById(instance.template_id);
  const config = STATUS_CONFIG[instance.status] ?? STATUS_CONFIG.active;
  const completedSteps = steps.filter((s) => s.status === "completed" || s.status === "skipped").length;
  const progress = steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;
  const deleteAction = deleteProcessInstance.bind(null, id);

  return (
    <div className={page.narrow}>
      <Link
        href="/processes"
        className="text-xs font-medium inline-block animate-fade-in"
        style={{ color: "var(--color-accent)" }}
      >
        &larr; Alle Prozesse
      </Link>

      <div className="flex items-center gap-3 animate-fade-in">
        <h1 className="text-xl md:text-2xl font-semibold" style={styles.title}>
          {instance.name}
        </h1>
        <span className={badge.pill} style={{ background: config.bg, color: config.color }}>
          {config.label}
        </span>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap gap-4 text-sm animate-fade-in" style={{ color: "var(--color-muted)" }}>
        {template && <span>Vorlage: {template.name}</span>}
        <span>Gestartet: {new Date(instance.started_at).toLocaleDateString("de-DE")}</span>
        {instance.completed_at && (
          <span>Abgeschlossen: {new Date(instance.completed_at).toLocaleDateString("de-DE")}</span>
        )}
      </div>

      {/* Progress bar */}
      <div className={`${card.base} animate-slide-up`} style={styles.panel}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Fortschritt
          </span>
          <span className="text-sm font-semibold" style={{ color: "var(--color-accent)" }}>
            {progress}%
          </span>
        </div>
        <div
          className="w-full h-2 rounded-full overflow-hidden"
          style={{ background: "var(--color-bg-elevated)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progress}%`,
              background: "var(--color-accent)",
            }}
          />
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>
          {completedSteps} von {steps.length} Schritten abgeschlossen
        </p>
      </div>

      {/* Step tracker */}
      <StepTracker steps={steps} instanceId={id} />

      {/* Soll-Ist Analysis */}
      {analysis.some((a) => a.actual_days !== null) && (
        <div className="flex flex-col gap-3 animate-fade-in">
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Soll-Ist-Analyse
          </h2>
          <div className="flex flex-col gap-2">
            {analysis.map((a) => {
              const hasData = a.actual_days !== null;
              const isOverdue = a.deviation_days !== null && a.deviation_days > 0;
              const isUnder = a.deviation_days !== null && a.deviation_days < 0;
              return (
                <div
                  key={a.step_order}
                  className={card.base}
                  style={styles.panel}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                        {a.step_name}
                      </span>
                      <div className="flex gap-3 text-xs" style={{ color: "var(--color-muted)" }}>
                        {a.expected_duration_days !== null && (
                          <span>Soll: {a.expected_duration_days}d</span>
                        )}
                        {hasData && (
                          <span>Ist: {Number(a.actual_days).toFixed(1)}d</span>
                        )}
                      </div>
                    </div>
                    {a.deviation_days !== null && (
                      <span
                        className={badge.pill}
                        style={{
                          background: isOverdue
                            ? "var(--color-danger-soft)"
                            : isUnder
                              ? "var(--color-success-soft)"
                              : "var(--color-bg-elevated)",
                          color: isOverdue
                            ? "var(--color-danger)"
                            : isUnder
                              ? "var(--color-success)"
                              : "var(--color-muted)",
                        }}
                      >
                        {isOverdue ? "+" : ""}
                        {Number(a.deviation_days).toFixed(1)}d
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <form action={deleteAction}>
        <button type="submit" className={btn.danger} style={styles.danger}>
          Prozess loeschen
        </button>
      </form>
    </div>
  );
}
