import Link from "next/link";
import { listTemplates } from "@/lib/db/queries/processes";
import { listCompanies } from "@/lib/db/queries/companies";
import { listProjects } from "@/lib/db/queries/projects";
import { createProcessInstance } from "@/app/actions";
import { card, btn, input, page, styles } from "@/components/ui/table-classes";

export const dynamic = "force-dynamic";

export default async function NewProcessInstancePage() {
  const [templates, companies, projects] = await Promise.all([
    listTemplates(),
    listCompanies(),
    listProjects(),
  ]);

  const activeTemplates = templates.filter((t) => t.is_active);

  return (
    <div className={page.narrow}>
      <Link
        href="/processes"
        className="text-xs font-medium inline-block animate-fade-in"
        style={{ color: "var(--color-accent)" }}
      >
        &larr; Alle Prozesse
      </Link>

      <h1
        className="text-xl md:text-2xl font-semibold animate-fade-in"
        style={styles.title}
      >
        Neuen Prozess starten
      </h1>

      {activeTemplates.length === 0 ? (
        <div
          className={`${card.base} flex flex-col items-center gap-3 py-12 text-center animate-scale-in`}
          style={styles.panel}
        >
          <p className="text-sm" style={styles.muted}>
            Erstelle zuerst eine Prozessvorlage.
          </p>
          <Link href="/processes/templates/new" className={btn.primary} style={styles.accent}>
            Vorlage erstellen
          </Link>
        </div>
      ) : (
        <form
          action={createProcessInstance}
          className={`${card.base} flex flex-col gap-5 animate-slide-up`}
          style={styles.panel}
        >
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Vorlage *
            </label>
            <select name="template_id" required className={input.base} style={styles.input}>
              <option value="">Bitte waehlen...</option>
              {activeTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.category ? ` (${t.category})` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Name *
            </label>
            <input
              name="name"
              required
              placeholder="z.B. Onboarding Firma Muster GmbH"
              className={input.base}
              style={styles.input}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Unternehmen (optional)
            </label>
            <select name="company_id" className={input.base} style={styles.input}>
              <option value="">Kein Unternehmen</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Projekt (optional)
            </label>
            <select name="project_id" className={input.base} style={styles.input}>
              <option value="">Kein Projekt</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button type="submit" className={btn.primary} style={styles.accent}>
              Prozess starten
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
