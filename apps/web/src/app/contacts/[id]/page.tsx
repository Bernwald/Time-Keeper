import Link from "next/link";
import { notFound } from "next/navigation";
import { getContactById } from "@/lib/db/queries/contacts";
import { listSourcesForEntity } from "@/lib/db/queries/source-links";
import { updateContact, deleteContact } from "@/app/actions";
import { card, badge, btn, input, page, styles } from "@/components/ui/table-classes";

export const dynamic = 'force-dynamic';

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [contact, linkedSources] = await Promise.all([
    getContactById(id),
    listSourcesForEntity("contact", id),
  ]);
  if (!contact) notFound();

  const updateAction = updateContact.bind(null, id);
  const deleteAction = deleteContact.bind(null, id);

  return (
    <div className={page.narrow}>
      <Link href="/contacts" className="text-xs font-medium inline-block animate-fade-in" style={{ color: "var(--color-accent)" }}>
        ← Alle Kontakte
      </Link>

      <h1 className="text-xl md:text-2xl font-semibold animate-fade-in" style={styles.title}>
        {contact.first_name} {contact.last_name}
      </h1>

      <form action={updateAction} className={`${card.base} flex flex-col gap-5 animate-slide-up`} style={styles.panel}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>Vorname *</label>
            <input name="first_name" required defaultValue={contact.first_name} className={input.base} style={styles.input} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>Nachname *</label>
            <input name="last_name" required defaultValue={contact.last_name} className={input.base} style={styles.input} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>E-Mail</label>
          <input name="email" type="email" defaultValue={contact.email ?? ""} className={input.base} style={styles.input} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Telefon</label>
          <input name="phone" type="tel" defaultValue={contact.phone ?? ""} className={input.base} style={styles.input} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Position / Rolle</label>
          <input name="role_title" defaultValue={contact.role_title ?? ""} className={input.base} style={styles.input} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Status</label>
          <select name="status" defaultValue={contact.status} className={input.base} style={styles.input}>
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv</option>
            <option value="archived">Archiviert</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Notizen</label>
          <textarea name="notes" rows={3} defaultValue={contact.notes ?? ""} className={input.textarea} style={styles.input} />
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
        <button type="submit" className={btn.danger} style={styles.danger}>Kontakt löschen</button>
      </form>
    </div>
  );
}
