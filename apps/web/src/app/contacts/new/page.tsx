"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createContact } from "@/app/actions";
import { card, btn, input, page, styles } from "@/components/ui/table-classes";

export default function NewContactPage() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try { await createContact(new FormData(e.currentTarget)); } catch { /* redirect */ } finally { setPending(false); }
  }

  return (
    <div className={page.narrow}>
      <div className="animate-fade-in">
        <Link href="/contacts" className="text-xs font-medium mb-2 inline-block" style={{ color: "var(--color-accent)" }}>← Zurück</Link>
        <h1 className="text-2xl font-semibold" style={styles.title}>Neuer Kontakt</h1>
      </div>

      <form onSubmit={handleSubmit} className={`${card.base} flex flex-col gap-5 animate-slide-up`} style={styles.panel}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>Vorname *</label>
            <input name="first_name" required className={input.base} style={styles.input} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>Nachname *</label>
            <input name="last_name" required className={input.base} style={styles.input} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>E-Mail</label>
          <input name="email" type="email" placeholder="name@beispiel.de" className={input.base} style={styles.input} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Telefon</label>
          <input name="phone" type="tel" placeholder="+49 …" className={input.base} style={styles.input} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Position / Rolle</label>
          <input name="role_title" placeholder="z. B. Geschäftsführer" className={input.base} style={styles.input} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Status</label>
          <select name="status" defaultValue="active" className={input.base} style={styles.input}>
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv</option>
            <option value="archived">Archiviert</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Notizen</label>
          <textarea name="notes" rows={3} className={input.textarea} style={styles.input} />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={pending} className={btn.primary} style={{ ...styles.accent, opacity: pending ? 0.6 : 1 }}>
            {pending ? "Wird gespeichert …" : "Kontakt anlegen"}
          </button>
          <button type="button" onClick={() => router.back()} className={btn.ghost} style={{ color: "var(--color-muted)" }}>Abbrechen</button>
        </div>
      </form>
    </div>
  );
}
