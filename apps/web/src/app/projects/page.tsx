import Link from "next/link";
import { listProjects } from "@/lib/db/queries/projects";
import { card, badge, btn, page, styles } from "@/components/ui/table-classes";

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <div className={page.wrapper}>
      <div className={page.headerRow}>
        <div className={`${page.header} animate-fade-in`}>
          <h1 className="text-2xl md:text-3xl font-semibold" style={styles.title}>Projekte</h1>
          <p className="text-sm" style={styles.muted}>
            {projects.length} {projects.length === 1 ? "Projekt" : "Projekte"}
          </p>
        </div>
        <Link href="/projects/new" className={btn.primary} style={styles.accent}>+ Neu</Link>
      </div>

      {projects.length === 0 ? (
        <div className={`${card.base} flex flex-col items-center gap-3 py-12 text-center animate-scale-in`} style={styles.panel}>
          <p className="text-sm" style={styles.muted}>Noch keine Projekte vorhanden.</p>
          <Link href="/projects/new" className={btn.primary} style={styles.accent}>Erstes Projekt anlegen</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 stagger-children">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className={card.hover} style={styles.panel}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="text-[15px] font-medium truncate" style={{ color: "var(--color-text)" }}>{p.name}</span>
                  {p.description && <span className="text-xs truncate" style={styles.muted}>{p.description}</span>}
                </div>
                <span
                  className={badge.pill}
                  style={{
                    background: p.status === "active" ? "var(--color-success-soft)" : "var(--color-bg-elevated)",
                    color: p.status === "active" ? "var(--color-success)" : "var(--color-muted)",
                  }}
                >
                  {p.status === "active" ? "Aktiv" : p.status === "inactive" ? "Inaktiv" : "Archiviert"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
