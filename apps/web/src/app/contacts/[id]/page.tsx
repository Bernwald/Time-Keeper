import Link from "next/link";
import { notFound } from "next/navigation";
import { getContactById } from "@/lib/db/queries/contacts";
import { updateContact, deleteContact } from "@/app/actions";
import { card, btn, input } from "@/components/ui/table-classes";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContactById(id);
  if (!contact) notFound();

  const updateAction = updateContact.bind(null, id);
  const deleteAction = deleteContact.bind(null, id);

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8 max-w-xl">
      <Link href="/contacts" className="text-sm" style={{ color: "var(--color-muted)" }}>
        ← Alle Kontakte
      </Link>

      <h1
        className="text-2xl font-semibold"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
      >
        {contact.first_name} {contact.last_name}
      </h1>

      <form
        action={updateAction}
        className={`${card.base} flex flex-col gap-5`}
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Vorname *</label>
            <input
              name="first_name"
              required
              defaultValue={contact.first_name}
              className={input.base}
              style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Nachname *</label>
            <input
              name="last_name"
              required
              defaultValue={contact.last_name}
              className={input.base}
              style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>E-Mail</label>
          <input
            name="email"
            type="email"
            defaultValue={contact.email ?? ""}
            className={input.base}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Telefon</label>
          <input
            name="phone"
            type="tel"
            defaultValue={contact.phone ?? ""}
            className={input.base}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Position / Rolle</label>
          <input
            name="role_title"
            defaultValue={contact.role_title ?? ""}
            className={input.base}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Status</label>
          <select
            name="status"
            defaultValue={contact.status}
            className={input.base}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          >
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv</option>
            <option value="archived">Archiviert</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Notizen</label>
          <textarea
            name="notes"
            rows={3}
            defaultValue={contact.notes ?? ""}
            className={input.textarea}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            className={btn.primary}
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            Speichern
          </button>
        </div>
      </form>

      <form action={deleteAction}>
        <button
          type="submit"
          className={btn.danger}
          style={{ background: "var(--color-danger-soft)", color: "var(--color-danger)" }}
        >
          Kontakt löschen
        </button>
      </form>
    </div>
  );
}
