import Link from "next/link";
import { notFound } from "next/navigation";
import { getActivityById, getActivityLinksResolved } from "@/lib/db/queries/activities";
import { getTagsForEntity, listTags } from "@/lib/db/queries/tags";
import { deleteActivity } from "@/app/actions";
import { TagManager } from "@/components/tags/tag-manager";
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

const ENTITY_LABELS: Record<string, string> = {
  company: "Unternehmen",
  contact: "Kontakt",
  project: "Projekt",
};

export default async function ActivityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [activity, links, entityTags, allTags] = await Promise.all([
    getActivityById(id),
    getActivityLinksResolved(id),
    getTagsForEntity("activity", id),
    listTags(),
  ]);
  if (!activity) notFound();

  const config = TYPE_CONFIG[activity.activity_type] ?? TYPE_CONFIG.note;
  const deleteAction = deleteActivity.bind(null, id);

  return (
    <div className={page.narrow}>
      <Link
        href="/activities"
        className="text-xs font-medium inline-block animate-fade-in"
        style={{ color: "var(--color-accent)" }}
      >
        &larr; Alle Aktivitaeten
      </Link>

      <div className="flex items-center gap-3 animate-fade-in">
        <span
          className={badge.pill}
          style={{ background: config.bg, color: config.color }}
        >
          {config.label}
        </span>
        <h1
          className="text-xl md:text-2xl font-semibold"
          style={styles.title}
        >
          {activity.title}
        </h1>
      </div>

      {/* Meta info */}
      <div className="flex flex-wrap gap-4 text-sm animate-fade-in" style={{ color: "var(--color-muted)" }}>
        <span>{new Date(activity.occurred_at).toLocaleString("de-DE")}</span>
        {activity.duration_minutes && <span>{activity.duration_minutes} Minuten</span>}
      </div>

      {/* Tags */}
      <div className="animate-fade-in">
        <p
          className="text-xs font-semibold uppercase tracking-wide mb-2"
          style={{ color: "var(--color-placeholder)" }}
        >
          Tags
        </p>
        <TagManager
          entityType="activity"
          entityId={id}
          currentTags={entityTags}
          allTags={allTags}
        />
      </div>

      {/* Description */}
      {activity.description && (
        <div
          className={`${card.base} animate-slide-up`}
          style={styles.panel}
        >
          <p
            className="text-sm whitespace-pre-wrap leading-relaxed"
            style={{ color: "var(--color-text)" }}
          >
            {activity.description}
          </p>
        </div>
      )}

      {/* Linked entities */}
      {links.length > 0 && (
        <div className="flex flex-col gap-3 animate-fade-in">
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--color-text)" }}
          >
            Verknuepfte Entitaeten
          </h2>
          <div className="flex flex-col gap-2">
            {links.map((link) => {
              const href =
                link.linked_type === "company"
                  ? `/companies/${link.linked_id}`
                  : link.linked_type === "contact"
                    ? `/contacts/${link.linked_id}`
                    : `/projects/${link.linked_id}`;
              return (
                <Link
                  key={link.id}
                  href={href}
                  className={`${card.hover} flex items-center gap-3`}
                  style={styles.panel}
                >
                  <span className={badge.pill} style={styles.accentSoft}>
                    {ENTITY_LABELS[link.linked_type] ?? link.linked_type}
                  </span>
                  <span
                    className="text-sm font-medium"
                    style={{ color: "var(--color-text)" }}
                  >
                    {link.linked_name}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <form action={deleteAction}>
        <button type="submit" className={btn.danger} style={styles.danger}>
          Aktivitaet loeschen
        </button>
      </form>
    </div>
  );
}
