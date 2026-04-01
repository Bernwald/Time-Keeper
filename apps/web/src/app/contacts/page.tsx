import Link from "next/link";
import { listContacts } from "@/lib/db/queries/contacts";
import { card, badge, btn } from "@/components/ui/table-classes";

export default async function ContactsPage() {
  const contacts = await listContacts();

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            Kontakte
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            {contacts.length} {contacts.length === 1 ? "Kontakt" : "Kontakte"} gespeichert
          </p>
        </div>
        <Link
          href="/contacts/new"
          className={btn.primary}
          style={{ background: "var(--color-accent)", color: "#fff" }}
        >
          + Neu
        </Link>
      </div>

      {contacts.length === 0 && (
        <div
          className={`${card.base} flex flex-col items-center justify-center gap-3 py-16 text-center`}
          style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
        >
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Noch keine Kontakte vorhanden.
          </p>
          <Link
            href="/contacts/new"
            className={btn.primary}
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            Ersten Kontakt anlegen
          </Link>
        </div>
      )}

      {contacts.length > 0 && (
        <div className="flex flex-col gap-3">
          {contacts.map((contact) => (
            <Link
              key={contact.id}
              href={`/contacts/${contact.id}`}
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
                  {contact.first_name} {contact.last_name}
                </span>
                {contact.role_title && (
                  <span className="text-xs truncate" style={{ color: "var(--color-muted)" }}>
                    {contact.role_title}
                  </span>
                )}
                {contact.email && (
                  <span className="text-xs truncate" style={{ color: "var(--color-muted)" }}>
                    {contact.email}
                  </span>
                )}
              </div>
              <span
                className={badge.base}
                style={{
                  background: contact.status === "active" ? "var(--color-accent-soft)" : "#f3f4f6",
                  color: contact.status === "active" ? "var(--color-accent)" : "#6b7280",
                }}
              >
                {contact.status === "active" ? "Aktiv" : contact.status === "inactive" ? "Inaktiv" : "Archiviert"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
