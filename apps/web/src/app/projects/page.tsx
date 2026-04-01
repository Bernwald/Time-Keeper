import Link from "next/link";
import { listProjects } from "@/lib/db/queries/projects";
import { card, badge, btn } from "@/components/ui/table-classes";

export default async function ProjectsPage() {
  const projects = await listProjects();

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            Projekte
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            {projects.length} {projects.length === 1 ? "Projekt" : "Projekte"} gespeichert
          </p>
        </div>
        <Link
          href="/projects/new"
          className={btn.primary}
          style={{ background: "var(--color-accent)", color: "#fff" }}
        >
          + Neu
        </Link>
      </div>

      {projects.length === 0 && (
        <div
          className={`${card.base} flex flex-col items-center justify-center gap-3 py-16 text-center`}
          style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
        >
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Noch keine Projekte vorhanden.
          </p>
          <Link
            href="/projects/new"
            className={btn.primary}
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            Erstes Projekt anlegen
          </Link>
        </div>
      )}

      {projects.length > 0 && (
        <div className="flex flex-col gap-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className={`${card.hover} flex items-center justify-between gap-4`}
              style={{
                background: "var(--color-panel)",
                border: "1px solid var(--color-line)",
                boxShadow: "var(--shadow-card)",
                textDecoration: "none",
              }}
            >
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="text-base font-medium truncate" style={{ color: "var(--color-text)" }}>
                  {project.name}
                </span>
                {project.description && (
                  <span className="text-xs truncate" style={{ color: "var(--color-muted)" }}>
                    {project.description}
                  </span>
                )}
              </div>
              <span
                className={badge.base}
                style={{
                  background: project.status === "active" ? "var(--color-accent-soft)" : "#f3f4f6",
                  color: project.status === "active" ? "var(--color-accent)" : "#6b7280",
                }}
              >
                {project.status === "active" ? "Aktiv" : project.status === "inactive" ? "Inaktiv" : "Archiviert"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
