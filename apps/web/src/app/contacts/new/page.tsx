"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createContact } from "@/app/actions";
import { card, btn, input } from "@/components/ui/table-classes";

export default function NewContactPage() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await createContact(new FormData(e.currentTarget));
    } catch {
      // redirect expected
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8 max-w-xl">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Neuer Kontakt
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className={`${card.base} flex flex-col gap-5`}
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Vorname *</label>
            <input
              name="first_name"
              required
              className={input.base}
              style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Nachname *</label>
            <input
              name="last_name"
              required
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
            placeholder="name@beispiel.de"
            className={input.base}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Telefon</label>
          <input
            name="phone"
            type="tel"
            placeholder="+49 …"
            className={input.base}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Position / Rolle</label>
          <input
            name="role_title"
            placeholder="z. B. Geschäftsführer"
            className={input.base}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Status</label>
          <select
            name="status"
            defaultValue="active"
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
            className={input.textarea}
            style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)", color: "var(--color-text)" }}
          />
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className={btn.primary}
            style={{ background: "var(--color-accent)", color: "#fff", opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "Wird gespeichert …" : "Kontakt anlegen"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className={btn.ghost}
            style={{ color: "var(--color-muted)" }}
          >
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
