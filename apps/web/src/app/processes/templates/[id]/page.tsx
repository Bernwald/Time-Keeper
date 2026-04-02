import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTemplateById,
  getTemplateSteps,
  getTemplatePerformance,
} from "@/lib/db/queries/processes";
import { deleteProcessTemplate } from "@/app/actions";
import { card, badge, btn, page, styles } from "@/components/ui/table-classes";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  consultant: "Berater",
  client: "Kunde",
  admin: "Admin",
};

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [template, steps, performance] = await Promise.all([
    getTemplateById(id),
    getTemplateSteps(id),
    getTemplatePerformance(id),
  ]);
  if (!template) notFound();

  const totalExpectedDays = steps.reduce(
    (sum, s) => sum + (s.expected_duration_days ?? 0),
    0,
  );
  const deleteAction = deleteProcessTemplate.bind(null, id);

  return (
    <div className={page.narrow}>
      <Link
        href="/processes"
        className="text-xs font-medium inline-block animate-fade-in"
        style={{ color: "var(--color-accent)" }}
      >
        &larr; Alle Prozesse
      </Link>

      <h1 className="text-xl md:text-2xl font-semibold animate-fade-in" style={styles.title}>
        {template.name}
      </h1>

      {template.description && (
        <p className="text-sm animate-fade-in" style={{ color: "var(--color-muted)" }}>
          {template.description}
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-sm animate-fade-in" style={{ color: "var(--color-muted)" }}>
        {template.category && <span>Kategorie: {template.category}</span>}
        <span>{steps.length} Schritte</span>
        {totalExpectedDays > 0 && <span>Geplante Dauer: {totalExpectedDays} Tage</span>}
      </div>

      {/* Performance metrics */}
      {performance && performance.total_instances > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 animate-fade-in">
          <MetricCard
            value={performance.total_instances}
            label="Instanzen"
            color="var(--color-info)"
          />
          <MetricCard
            value={`${performance.completion_rate}%`}
            label="Abschlussrate"
            color="var(--color-success)"
          />
          <MetricCard
            value={performance.avg_duration_days ? `${performance.avg_duration_days}d` : "-"}
            label="Ø Dauer"
            color="var(--color-accent)"
          />
          <MetricCard
            value={performance.bottleneck_step ?? "-"}
            label="Engpass"
            color="var(--color-danger)"
            small
          />
        </div>
      )}

      {/* Steps */}
      <div className="flex flex-col gap-3 animate-slide-up">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Schritte
        </h2>
        {steps.length === 0 ? (
          <p className="text-sm" style={styles.muted}>
            Keine Schritte definiert.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {steps.map((step) => (
              <div
                key={step.id}
                className={card.base}
                style={styles.panel}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{
                        background: "var(--color-accent-soft)",
                        color: "var(--color-accent)",
                      }}
                    >
                      {step.step_order}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                        {step.name}
                      </span>
                      <div className="flex gap-2 text-[11px]" style={{ color: "var(--color-placeholder)" }}>
                        {step.expected_duration_days && (
                          <span>{step.expected_duration_days} Tage</span>
                        )}
                        {step.responsible_role && (
                          <span>{ROLE_LABELS[step.responsible_role] ?? step.responsible_role}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3 animate-fade-in">
        <Link
          href={`/processes/new?template=${id}`}
          className={btn.primary}
          style={styles.accent}
        >
          Prozess aus Vorlage starten
        </Link>
      </div>

      <form action={deleteAction}>
        <button type="submit" className={btn.danger} style={styles.danger}>
          Vorlage loeschen
        </button>
      </form>
    </div>
  );
}

function MetricCard({
  value,
  label,
  color,
  small,
}: {
  value: number | string;
  label: string;
  color: string;
  small?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-3 md:p-4"
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-line)",
      }}
    >
      <span
        className={`${small ? "text-sm" : "text-2xl"} font-bold block truncate`}
        style={{ fontFamily: "var(--font-display)", color }}
      >
        {value}
      </span>
      <span className="text-xs font-medium block mt-0.5" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
    </div>
  );
}
