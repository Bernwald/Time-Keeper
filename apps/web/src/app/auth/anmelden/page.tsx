"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/db/supabase-browser";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError("E-Mail oder Passwort ist falsch.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="rounded-xl p-6" style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}>
      <div className="text-center mb-6">
        <div
          className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center text-base font-bold gradient-accent"
          style={{ color: "var(--color-accent-text)" }}
        >
          TK
        </div>
        <h1
          className="text-xl font-semibold"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Anmelden
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
            E-Mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="min-h-[44px] px-3 rounded-lg text-sm"
            style={{
              border: "1px solid var(--color-line)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
            placeholder="name@beispiel.de"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
            Passwort
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="min-h-[44px] px-3 rounded-lg text-sm"
            style={{
              border: "1px solid var(--color-line)",
              background: "var(--color-bg)",
              color: "var(--color-text)",
            }}
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
          {loading ? "Wird angemeldet..." : "Anmelden"}
        </button>
      </form>

      <p className="text-center text-sm mt-4" style={{ color: "var(--color-muted)" }}>
        Noch kein Konto?{" "}
        <Link href="/auth/registrieren" className="font-medium" style={{ color: "var(--color-accent)" }}>
          Registrieren
        </Link>
      </p>
    </div>
  );
}
