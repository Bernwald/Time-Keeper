"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createCompany } from "@/app/actions";
import { card, btn, input, page, styles } from "@/components/ui/table-classes";

export default function NewCompanyPage() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try { await createCompany(new FormData(e.currentTarget)); } catch { /* redirect */ } finally { setPending(false); }
  }

  return (
    <div className={page.narrow}>
      <div className="animate-fade-in">
        <Link href="/companies" className="text-xs font-medium mb-2 inline-block" style={{ color: "var(--color-accent)" }}>← Zurück</Link>
        <h1 className="text-2xl font-semibold" style={styles.title}>Neues Unternehmen</h1>
      </div>

      <form onSubmit={handleSubmit} className={`${card.base} flex flex-col gap-5 animate-slide-up`} style={styles.panel}>
        <Field label="Name *" name="name" required placeholder="z. B. Acme GmbH" />
        <Field label="Website" name="website" type="url" placeholder="https://…" />
        <StatusSelect />
        <Field label="Notizen" name="notes" textarea rows={4} placeholder="Interne Notizen (optional)" />

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={pending} className={btn.primary} style={{ ...styles.accent, opacity: pending ? 0.6 : 1 }}>
            {pending ? "Wird gespeichert …" : "Anlegen"}
          </button>
          <button type="button" onClick={() => router.back()} className={btn.ghost} style={{ color: "var(--color-muted)" }}>Abbrechen</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, textarea, ...props }: { label: string; textarea?: boolean; [k: string]: unknown }) {
  const Tag = textarea ? "textarea" : "input";
  return (
    <div className="flex flex-col gap-1.5">
      <label className={input.label} style={{ color: "var(--color-text)" }}>{label}</label>
      <Tag className={textarea ? input.textarea : input.base} style={styles.input} {...props as Record<string, unknown>} />
    </div>
  );
}

function StatusSelect({ defaultValue = "active" }: { defaultValue?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={input.label} style={{ color: "var(--color-text)" }}>Status</label>
      <select name="status" defaultValue={defaultValue} className={input.base} style={styles.input}>
        <option value="active">Aktiv</option>
        <option value="inactive">Inaktiv</option>
        <option value="archived">Archiviert</option>
      </select>
    </div>
  );
}
