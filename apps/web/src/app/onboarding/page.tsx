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

export default function OnboardingPage() {
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

    const trimmedName = name.trim();
    const trimmedSlug = slug.trim();
    if (!trimmedName || !trimmedSlug) return;

    setLoading(true);

    const supabase = createBrowserSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Nicht angemeldet.");
      setLoading(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc("onboard_organization_v2", {
      p_user_id: user.id,
      p_org_name: trimmedName,
      p_org_slug: trimmedSlug,
      p_plan_id: "standard",
    });

    if (rpcError) {
      if (rpcError.message.includes("duplicate") || rpcError.message.includes("unique")) {
        setError("Dieser Slug ist bereits vergeben. Bitte waehle einen anderen.");
      } else {
        setError("Fehler beim Erstellen. Bitte versuche es erneut.");
      }
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div
      className="min-h-[100dvh] flex items-center justify-center p-4"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="w-full max-w-sm">
        <div className="rounded-xl p-6" style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}>
          <div className="text-center mb-6">
            <h1
              className="text-xl font-semibold"
              style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
            >
              Organisation erstellen
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
              Erstelle deine Organisation, um loszulegen.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
                placeholder="Meine Firma GmbH"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
                Slug (URL-Kennung)
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlugManual(true);
                  setSlug(slugify(e.target.value));
                }}
                required
                pattern="[a-z0-9-]+"
                className="min-h-[44px] px-3 rounded-lg text-sm font-mono"
                style={{
                  border: "1px solid var(--color-line)",
                  background: "var(--color-bg)",
                  color: "var(--color-text)",
                }}
                placeholder="meine-firma"
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
              {loading ? "Wird erstellt..." : "Organisation erstellen"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
