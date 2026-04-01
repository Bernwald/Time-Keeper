"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "@/app/actions";
import { card, btn, input } from "@/components/ui/table-classes";

export default function NewProjectPage() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      await createProject(new FormData(e.currentTarget));
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
          Neues Projekt
        </h1>
      </div>

      <form
        onSubmit={handleSubmit}
        className={`${card.base} flex flex-col gap-5`}
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Name *</label>
          <input
            name="name"
            required
            placeholder="z. B. Website-Relaunch"
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
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Beschreibung</label>
          <textarea
            name="description"
            rows={4}
            placeholder="Kurze Projektbeschreibung (optional)"
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
            {pending ? "Wird gespeichert …" : "Projekt anlegen"}
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
