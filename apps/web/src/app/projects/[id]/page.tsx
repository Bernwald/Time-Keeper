import Link from "next/link";
import { notFound } from "next/navigation";
import { getProjectById } from "@/lib/db/queries/projects";
import { updateProject, deleteProject } from "@/app/actions";
import { card, btn, input, page, styles } from "@/components/ui/table-classes";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) notFound();

  const updateAction = updateProject.bind(null, id);
  const deleteAction = deleteProject.bind(null, id);

  return (
    <div className={page.narrow}>
      <Link href="/projects" className="text-xs font-medium inline-block animate-fade-in" style={{ color: "var(--color-accent)" }}>
        ← Alle Projekte
      </Link>

      <h1 className="text-xl md:text-2xl font-semibold animate-fade-in" style={styles.title}>{project.name}</h1>

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

      <form action={deleteAction}>
        <button type="submit" className={btn.danger} style={styles.danger}>Projekt löschen</button>
      </form>
    </div>
  );
}
