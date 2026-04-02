import Link from "next/link";
import type { ActivityWithCreator } from "@/lib/db/queries/activities";
import { badge } from "@/components/ui/table-classes";

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  note: { label: "Notiz", color: "var(--color-accent)", bg: "var(--color-accent-soft)" },
  meeting: { label: "Meeting", color: "var(--color-info)", bg: "var(--color-info-soft)" },
  call: { label: "Anruf", color: "var(--color-success)", bg: "var(--color-success-soft)" },
  email: { label: "E-Mail", color: "var(--color-warning)", bg: "var(--color-warning-soft)" },
  decision: { label: "Entscheidung", color: "var(--color-danger)", bg: "var(--color-danger-soft)" },
  milestone: { label: "Meilenstein", color: "#7c3aed", bg: "#7c3aed18" },
};

export function ActivityTimeline({
  activities,
  entityType,
  entityId,
}: {
  activities: ActivityWithCreator[];
  entityType: string;
  entityId: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2
          className="text-sm font-semibold"
          style={{ color: "var(--color-text)" }}
        >
          Aktivitaeten
        </h2>
        <Link
          href={`/activities/new?linkType=${entityType}&linkId=${entityId}`}
          className="text-xs font-medium"
          style={{ color: "var(--color-accent)" }}
        >
          + Neue Aktivitaet
        </Link>
      </div>

      {activities.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-muted)" }}>
          Noch keine Aktivitaeten erfasst.
        </p>
      ) : (
        <div className="flex flex-col gap-0">
          {activities.map((a, i) => {
            const config = TYPE_CONFIG[a.activity_type] ?? TYPE_CONFIG.note;
            const isLast = i === activities.length - 1;
            return (
              <div key={a.id} className="flex gap-3">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
                    style={{ background: config.color }}
                  />
                  {!isLast && (
                    <div
                      className="w-px flex-1 min-h-[24px]"
                      style={{ background: "var(--color-line)" }}
                    />
                  )}
                </div>

                {/* Content */}
                <Link
                  href={`/activities/${a.id}`}
                  className="flex-1 pb-4 min-w-0"
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span
                      className={badge.pill}
                      style={{ background: config.bg, color: config.color, fontSize: "10px" }}
                    >
                      {config.label}
                    </span>
                    <span
                      className="text-[11px]"
                      style={{ color: "var(--color-placeholder)" }}
                    >
                      {new Date(a.occurred_at).toLocaleDateString("de-DE")}
                    </span>
                  </div>
                  <p
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--color-text)" }}
                  >
                    {a.title}
                  </p>
                  {a.description && (
                    <p
                      className="text-xs mt-0.5 truncate"
                      style={{ color: "var(--color-muted)" }}
                    >
                      {a.description.slice(0, 120)}
                      {a.description.length > 120 ? "..." : ""}
                    </p>
                  )}
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
