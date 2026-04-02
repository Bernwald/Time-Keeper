import Link from "next/link";
import { listActivities } from "@/lib/db/queries/activities";
import { card, badge, btn, page, styles } from "@/components/ui/table-classes";

export const dynamic = "force-dynamic";

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  note: { label: "Notiz", color: "var(--color-accent)", bg: "var(--color-accent-soft)" },
  meeting: { label: "Meeting", color: "var(--color-info)", bg: "var(--color-info-soft)" },
  call: { label: "Anruf", color: "var(--color-success)", bg: "var(--color-success-soft)" },
  email: { label: "E-Mail", color: "var(--color-warning)", bg: "var(--color-warning-soft)" },
  decision: { label: "Entscheidung", color: "var(--color-danger)", bg: "var(--color-danger-soft)" },
  milestone: { label: "Meilenstein", color: "#7c3aed", bg: "#7c3aed18" },
};

export default async function ActivitiesPage() {
  const activities = await listActivities();

  return (
    <div className={page.wrapper}>
      <div className={page.headerRow}>
        <div className={`${page.header} animate-fade-in`}>
          <h1 className="text-2xl md:text-3xl font-semibold" style={styles.title}>
            Aktivitaeten
          </h1>
          <p className="text-sm" style={styles.muted}>
            {activities.length} {activities.length === 1 ? "Eintrag" : "Eintraege"}
          </p>
        </div>
        <Link href="/activities/new" className={btn.primary} style={styles.accent}>
          + Neue Aktivitaet
        </Link>
      </div>

      {activities.length === 0 ? (
        <div
          className={`${card.base} flex flex-col items-center gap-3 py-12 text-center animate-scale-in`}
          style={styles.panel}
        >
          <p className="text-sm" style={styles.muted}>
            Noch keine Aktivitaeten erfasst.
          </p>
          <Link href="/activities/new" className={btn.primary} style={styles.accent}>
            Erste Aktivitaet erfassen
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 stagger-children">
          {activities.map((a) => {
            const config = TYPE_CONFIG[a.activity_type] ?? TYPE_CONFIG.note;
            return (
              <Link
                key={a.id}
                href={`/activities/${a.id}`}
                className={card.hover}
                style={styles.panel}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span
                      className={badge.pill}
                      style={{ background: config.bg, color: config.color }}
                    >
                      {config.label}
                    </span>
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span
                        className="text-[15px] font-medium truncate"
                        style={{ color: "var(--color-text)" }}
                      >
                        {a.title}
                      </span>
                      {a.description && (
                        <span
                          className="text-xs truncate"
                          style={{ color: "var(--color-muted)" }}
                        >
                          {a.description.slice(0, 100)}
                          {a.description.length > 100 ? "..." : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    <span
                      className="text-xs"
                      style={{ color: "var(--color-muted)" }}
                    >
                      {new Date(a.occurred_at).toLocaleDateString("de-DE")}
                    </span>
                    {a.duration_minutes && (
                      <span
                        className="text-[11px]"
                        style={{ color: "var(--color-placeholder)" }}
                      >
                        {a.duration_minutes} Min.
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
