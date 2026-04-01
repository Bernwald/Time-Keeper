"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/db/supabase-browser";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export default function NeuerKundePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugManual) {
      setSlug(slugify(value));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName || !trimmedSlug) return;

    try {
      const res = await fetch("/admin/api/kunden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, slug: trimmedSlug }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Fehler beim Erstellen.");
        setLoading(false);
        return;
      }

      const { id } = await res.json();
      router.push(`/admin/kunden/${id}`);
      router.refresh();
    } catch {
      setError("Netzwerkfehler. Bitte versuche es erneut.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md">
      <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--color-text)" }}>
        Neuen Kunden anlegen
      </h2>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl p-5"
        style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            className="min-h-[44px] px-3 rounded-lg text-sm"
            style={{
              border: "1px solid var(--color-line)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
            placeholder="Firma GmbH"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Slug
          </label>
          <input
            type="text"
            value={slug}
            onChange={(e) => {
              setSlugManual(true);
              setSlug(slugify(e.target.value));
            }}
            required
            className="min-h-[44px] px-3 rounded-lg text-sm font-mono"
            style={{
              border: "1px solid var(--color-line)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
            placeholder="firma-gmbh"
          />
        </div>

        {error && (
          <p className="text-sm" style={{ color: "var(--color-danger)" }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="min-h-[44px] rounded-lg text-sm font-medium gradient-accent"
          style={{ color: "var(--color-accent-text)", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Wird erstellt..." : "Kunde anlegen"}
        </button>
      </form>
    </div>
  );
}
