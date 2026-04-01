import Link from "next/link";
import { listContacts } from "@/lib/db/queries/contacts";
import { card, badge, btn, page, styles } from "@/components/ui/table-classes";

export default async function ContactsPage() {
  const contacts = await listContacts();

  return (
    <div className={page.wrapper}>
      <div className={page.headerRow}>
        <div className={`${page.header} animate-fade-in`}>
          <h1 className="text-2xl md:text-3xl font-semibold" style={styles.title}>Kontakte</h1>
          <p className="text-sm" style={styles.muted}>
            {contacts.length} {contacts.length === 1 ? "Kontakt" : "Kontakte"}
          </p>
        </div>
        <Link href="/contacts/new" className={btn.primary} style={styles.accent}>+ Neu</Link>
      </div>

      {contacts.length === 0 ? (
        <div className={`${card.base} flex flex-col items-center gap-3 py-12 text-center animate-scale-in`} style={styles.panel}>
          <p className="text-sm" style={styles.muted}>Noch keine Kontakte vorhanden.</p>
          <Link href="/contacts/new" className={btn.primary} style={styles.accent}>Ersten Kontakt anlegen</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 stagger-children">
          {contacts.map((c) => (
            <Link key={c.id} href={`/contacts/${c.id}`} className={card.hover} style={styles.panel}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="text-[15px] font-medium truncate" style={{ color: "var(--color-text)" }}>
                    {c.first_name} {c.last_name}
                  </span>
                  {c.role_title && <span className="text-xs truncate" style={styles.muted}>{c.role_title}</span>}
                  {c.email && <span className="text-xs truncate" style={styles.muted}>{c.email}</span>}
                </div>
                <span
                  className={badge.pill}
                  style={{
                    background: c.status === "active" ? "var(--color-success-soft)" : "var(--color-bg-elevated)",
                    color: c.status === "active" ? "var(--color-success)" : "var(--color-muted)",
                  }}
                >
                  {c.status === "active" ? "Aktiv" : c.status === "inactive" ? "Inaktiv" : "Archiviert"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
