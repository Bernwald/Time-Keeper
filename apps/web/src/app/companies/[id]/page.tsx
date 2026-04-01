import Link from "next/link";
import { notFound } from "next/navigation";
import { getCompanyById } from "@/lib/db/queries/companies";
import { listSourcesForEntity } from "@/lib/db/queries/source-links";
import { updateCompany, deleteCompany } from "@/app/actions";
import { card, badge, btn, input, page, styles } from "@/components/ui/table-classes";

export const dynamic = 'force-dynamic';

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [company, linkedSources] = await Promise.all([
    getCompanyById(id),
    listSourcesForEntity("company", id),
  ]);
  if (!company) notFound();

  const updateAction = updateCompany.bind(null, id);
  const deleteAction = deleteCompany.bind(null, id);

  return (
    <div className={page.narrow}>
      <Link href="/companies" className="text-xs font-medium inline-block animate-fade-in" style={{ color: "var(--color-accent)" }}>
        ← Alle Unternehmen
      </Link>

      <h1 className="text-xl md:text-2xl font-semibold animate-fade-in" style={styles.title}>{company.name}</h1>

      <form action={updateAction} className={`${card.base} flex flex-col gap-5 animate-slide-up`} style={styles.panel}>
        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Name *</label>
          <input name="name" required defaultValue={company.name} className={input.base} style={styles.input} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Website</label>
          <input name="website" type="url" defaultValue={company.website ?? ""} placeholder="https://…" className={input.base} style={styles.input} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Status</label>
          <select name="status" defaultValue={company.status} className={input.base} style={styles.input}>
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv</option>
            <option value="archived">Archiviert</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Notizen</label>
          <textarea name="notes" rows={4} defaultValue={company.notes ?? ""} className={input.textarea} style={styles.input} />
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className={btn.primary} style={styles.accent}>Speichern</button>
        </div>
      </form>

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
        <button type="submit" className={btn.danger} style={styles.danger}>Unternehmen löschen</button>
      </form>
    </div>
  );
}
