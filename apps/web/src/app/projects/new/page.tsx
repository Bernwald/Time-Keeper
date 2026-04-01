"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProject } from "@/app/actions";
import { card, btn, input, page, styles } from "@/components/ui/table-classes";

export default function NewProjectPage() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try { await createProject(new FormData(e.currentTarget)); } catch { /* redirect */ } finally { setPending(false); }
  }

  return (
    <div className={page.narrow}>
      <div className="animate-fade-in">
        <Link href="/projects" className="text-xs font-medium mb-2 inline-block" style={{ color: "var(--color-accent)" }}>← Zurück</Link>
        <h1 className="text-2xl font-semibold" style={styles.title}>Neues Projekt</h1>
      </div>

      <form onSubmit={handleSubmit} className={`${card.base} flex flex-col gap-5 animate-slide-up`} style={styles.panel}>
        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Name *</label>
          <input name="name" required placeholder="z. B. Website-Relaunch" className={input.base} style={styles.input} />
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
          <label className={input.label} style={{ color: "var(--color-text)" }}>Beschreibung</label>
          <textarea name="description" rows={4} placeholder="Projektbeschreibung (optional)" className={input.textarea} style={styles.input} />
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" disabled={pending} className={btn.primary} style={{ ...styles.accent, opacity: pending ? 0.6 : 1 }}>
            {pending ? "Wird gespeichert …" : "Projekt anlegen"}
          </button>
          <button type="button" onClick={() => router.back()} className={btn.ghost} style={{ color: "var(--color-muted)" }}>Abbrechen</button>
        </div>
      </form>
    </div>
  );
}
