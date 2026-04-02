import Link from "next/link";
import {
  listTemplates,
  listInstances,
  getProcessDashboard,
} from "@/lib/db/queries/processes";
import { card, badge, btn, page, styles } from "@/components/ui/table-classes";

export const dynamic = "force-dynamic";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Aktiv", color: "var(--color-success)", bg: "var(--color-success-soft)" },
  completed: { label: "Abgeschlossen", color: "var(--color-accent)", bg: "var(--color-accent-soft)" },
  paused: { label: "Pausiert", color: "var(--color-warning)", bg: "var(--color-warning-soft)" },
  cancelled: { label: "Abgebrochen", color: "var(--color-danger)", bg: "var(--color-danger-soft)" },
};

export default async function ProcessesPage() {
  const [templates, instances, dashboard] = await Promise.all([
    listTemplates(),
    listInstances(),
    getProcessDashboard(),
  ]);

  return (
    <div className={page.wrapper}>
      <div className={page.headerRow}>
        <div className={`${page.header} animate-fade-in`}>
          <h1 className="text-2xl md:text-3xl font-semibold" style={styles.title}>
            Prozesse
          </h1>
          <p className="text-sm" style={styles.muted}>
            {templates.length} Vorlagen, {instances.length} Instanzen
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/processes/templates/new" className={btn.secondary} style={{
            background: "#fff",
            color: "var(--color-text)",
            border: "1px solid var(--color-line)",
          }}>
            + Vorlage
          </Link>
          <Link href="/processes/new" className={btn.primary} style={styles.accent}>
            + Prozess starten
          </Link>
        </div>
      </div>

      {/* Dashboard KPIs */}
      {dashboard && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 stagger-children animate-fade-in">
          <KpiCard
            value={dashboard.active_instances}
            label="Aktive Prozesse"
            color="var(--color-success)"
          />
          <KpiCard
            value={dashboard.completed_instances}
            label="Abgeschlossen"
            color="var(--color-accent)"
          />
          <KpiCard
            value={dashboard.overdue_steps}
            label="Ueberfaellige Schritte"
            color="var(--color-danger)"
          />
          <KpiCard
            value={dashboard.avg_completion_days ? `${dashboard.avg_completion_days}d` : "-"}
            label="Ø Durchlaufzeit"
            color="var(--color-info)"
          />
        </div>
      )}

      {/* Active instances */}
      <div className="flex flex-col gap-3 animate-fade-in">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Laufende Instanzen
        </h2>
        {instances.length === 0 ? (
          <div className={`${card.base} flex flex-col items-center gap-3 py-8 text-center`} style={styles.panel}>
            <p className="text-sm" style={styles.muted}>
              Keine Prozessinstanzen vorhanden.
            </p>
            <Link href="/processes/new" className={btn.primary} style={styles.accent}>
              Ersten Prozess starten
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5 stagger-children">
            {instances.map((inst) => {
              const config = STATUS_CONFIG[inst.status] ?? STATUS_CONFIG.active;
              return (
                <Link
                  key={inst.id}
                  href={`/processes/${inst.id}`}
                  className={card.hover}
                  style={styles.panel}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-[15px] font-medium truncate" style={{ color: "var(--color-text)" }}>
                        {inst.name}
                      </span>
                      <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                        Gestartet: {new Date(inst.started_at).toLocaleDateString("de-DE")}
                      </span>
                    </div>
                    <span className={badge.pill} style={{ background: config.bg, color: config.color }}>
                      {config.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Templates */}
      <div className="flex flex-col gap-3 animate-fade-in">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Vorlagen
        </h2>
        {templates.length === 0 ? (
          <p className="text-sm" style={styles.muted}>
            Noch keine Vorlagen erstellt.
          </p>
        ) : (
          <div className="flex flex-col gap-2 stagger-children">
            {templates.map((t) => (
              <Link
                key={t.id}
                href={`/processes/templates/${t.id}`}
                className={card.hover}
                style={styles.panel}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[15px] font-medium truncate" style={{ color: "var(--color-text)" }}>
                      {t.name}
                    </span>
                    {t.description && (
                      <span className="text-xs truncate" style={{ color: "var(--color-muted)" }}>
                        {t.description}
                      </span>
                    )}
                  </div>
                  {t.category && (
                    <span className={badge.pill} style={styles.accentSoft}>
                      {t.category}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  value,
  label,
  color,
}: {
  value: number | string;
  label: string;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-4 md:p-5"
      style={{
        background: "#fff",
        border: "1px solid var(--color-line)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <span
        className="text-3xl md:text-4xl font-bold block"
        style={{ fontFamily: "var(--font-display)", color }}
      >
        {value}
      </span>
      <span className="text-sm font-medium block mt-1" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
    </div>
  );
}
