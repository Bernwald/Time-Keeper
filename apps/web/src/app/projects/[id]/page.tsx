import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectById } from "@/lib/db/queries/projects";
import { listSourcesForEntity } from "@/lib/db/queries/source-links";
import { getTagsForEntity, listTags } from "@/lib/db/queries/tags";
import { getActivitiesForEntity } from "@/lib/db/queries/activities";
import { getInstancesForEntity } from "@/lib/db/queries/processes";
import { updateProject, deleteProject } from "@/app/actions";
import { TagManager } from "@/components/tags/tag-manager";
import { ActivityTimeline } from "@/components/activities/activity-timeline";
import { ProcessList } from "@/components/processes/process-list";
import { card, badge, btn, input, page, styles } from "@/components/ui/table-classes";

export const dynamic = 'force-dynamic';

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, linkedSources, entityTags, allTags, activities, processInstances] = await Promise.all([
    getProjectById(id),
    listSourcesForEntity("project", id),
    getTagsForEntity("project", id),
    listTags(),
    getActivitiesForEntity("project", id),
    getInstancesForEntity("project", id),
  ]);
  if (!project) notFound();

  const updateAction = updateProject.bind(null, id);
  const deleteAction = deleteProject.bind(null, id);

  return (
    <div className={page.narrow}>
      <Link href="/projects" className="text-xs font-medium inline-block animate-fade-in" style={{ color: "var(--color-accent)" }}>
        ← Alle Projekte
      </Link>

      <h1 className="text-xl md:text-2xl font-semibold animate-fade-in" style={styles.title}>{project.name}</h1>

      {/* Tags */}
      <div className="animate-fade-in">
        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--color-placeholder)" }}>
          Tags
        </p>
        <TagManager entityType="project" entityId={id} currentTags={entityTags} allTags={allTags} />
      </div>

      <form action={updateAction} className={`${card.base} flex flex-col gap-5 animate-slide-up`} style={styles.panel}>
        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Name *</label>
          <input name="name" required defaultValue={project.name} className={input.base} style={styles.input} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Status</label>
          <select name="status" defaultValue={project.status} className={input.base} style={styles.input}>
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv</option>
            <option value="archived">Archiviert</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Beschreibung</label>
          <textarea name="description" rows={4} defaultValue={project.description ?? ""} className={input.textarea} style={styles.input} />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className={btn.primary} style={styles.accent}>Speichern</button>
        </div>
      </form>

      {/* Process Instances */}
      <div className="animate-fade-in">
        <ProcessList instances={processInstances} />
      </div>

      {/* Activity Timeline */}
      <div className="animate-fade-in">
        <ActivityTimeline activities={activities} entityType="project" entityId={id} />
      </div>

      {/* Linked Sources */}
      {linkedSources.length > 0 && (
        <div className="flex flex-col gap-3 animate-fade-in">
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            Verknüpfte Quellen
          </h2>
          <div className="flex flex-col gap-2">
            {linkedSources.map((ls) => (
              <Link
                key={ls.id}
                href={`/sources/${ls.source_id}`}
                className={`${card.hover} flex items-center gap-3`}
                style={styles.panel}
              >
                <span className={badge.pill} style={styles.accentSoft}>
                  {ls.source_type}
                </span>
                <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                  {ls.source_title}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <form action={deleteAction}>
        <button type="submit" className={btn.danger} style={styles.danger}>Projekt löschen</button>
      </form>
    </div>
  );
}
