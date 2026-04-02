import Link from "next/link";
import { listCompanies } from "@/lib/db/queries/companies";
import { listContacts } from "@/lib/db/queries/contacts";
import { listProjects } from "@/lib/db/queries/projects";
import { createActivity } from "@/app/actions";
import { ACTIVITY_TYPES } from "@/lib/db/queries/activities";
import { card, btn, input, page, styles } from "@/components/ui/table-classes";

export const dynamic = "force-dynamic";

export default async function NewActivityPage() {
  const [companies, contacts, projects] = await Promise.all([
    listCompanies(),
    listContacts(),
    listProjects(),
  ]);

  return (
    <div className={page.narrow}>
      <Link
        href="/activities"
        className="text-xs font-medium inline-block animate-fade-in"
        style={{ color: "var(--color-accent)" }}
      >
        &larr; Alle Aktivitaeten
      </Link>

      <h1
        className="text-xl md:text-2xl font-semibold animate-fade-in"
        style={styles.title}
      >
        Neue Aktivitaet
      </h1>

      <form
        action={createActivity}
        className={`${card.base} flex flex-col gap-5 animate-slide-up`}
        style={styles.panel}
      >
        {/* Type */}
        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>
            Typ *
          </label>
          <select
            name="activity_type"
            required
            className={input.base}
            style={styles.input}
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>
            Titel *
          </label>
          <input
            name="title"
            required
            placeholder="z.B. Kick-off Meeting mit Kunde X"
            className={input.base}
            style={styles.input}
          />
        </div>

        {/* Description */}
        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>
            Beschreibung
          </label>
          <textarea
            name="description"
            rows={5}
            placeholder="Details, Ergebnisse, Notizen..."
            className={input.textarea}
            style={styles.input}
          />
          <p className={input.hint} style={{ color: "var(--color-muted)" }}>
            Wird automatisch als durchsuchbare Quelle im RAG-Chat verfuegbar gemacht.
          </p>
        </div>

        {/* Date and duration */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Datum
            </label>
            <input
              name="occurred_at"
              type="datetime-local"
              defaultValue={new Date().toISOString().slice(0, 16)}
              className={input.base}
              style={styles.input}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Dauer (Minuten)
            </label>
            <input
              name="duration_minutes"
              type="number"
              min="0"
              placeholder="z.B. 60"
              className={input.base}
              style={styles.input}
            />
          </div>
        </div>

        {/* Entity link */}
        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>
            Verknuepfung (optional)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select name="link_type" className={input.base} style={styles.input}>
              <option value="">Keine Verknuepfung</option>
              <option value="company">Unternehmen</option>
              <option value="contact">Kontakt</option>
              <option value="project">Projekt</option>
            </select>
            <select name="link_id" className={input.base} style={styles.input}>
              <option value="">Bitte waehlen...</option>
              <optgroup label="Unternehmen">
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Kontakte">
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Projekte">
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className={btn.primary} style={styles.accent}>
            Aktivitaet erfassen
          </button>
        </div>
      </form>
    </div>
  );
}
