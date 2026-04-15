"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/db/supabase-browser";

const LINK_ERROR_MESSAGES: Record<string, string> = {
  link_invalid:
    "Der Anmelde-Link ist abgelaufen oder wurde bereits verwendet. Fordere unten einen neuen an.",
  missing_code:
    "Der Anmelde-Link war unvollständig. Fordere unten einen neuen an.",
  missing_token:
    "Der Anmelde-Link war unvollständig. Fordere unten einen neuen an.",
};

function LoginForm() {
  const searchParams = useSearchParams();
  const urlErrorCode = searchParams.get("error");
  const urlErrorReason = searchParams.get("reason");
  const urlError = urlErrorCode
    ? LINK_ERROR_MESSAGES[urlErrorCode] ??
      "Anmeldung fehlgeschlagen. Fordere unten einen neuen Link an."
    : null;

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const displayError = error ?? urlError;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // The branded email template links to `/auth/confirm?token_hash=…`,
        // which does not need a client-side code_verifier — the link works
        // across devices and browsers. `emailRedirectTo` is used as the
        // fallback `redirect_to` if the dashboard template still points at
        // `{{ .ConfirmationURL }}` (PKCE flow).
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (error) {
      setError("Versand fehlgeschlagen. Bitte prüfe die E-Mail-Adresse und versuche es erneut.");
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <div
      className="rounded-xl p-6"
      style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
    >
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
        <p className="text-sm mt-2" style={{ color: "var(--color-muted)" }}>
          Wir senden dir einen Login-Link per E-Mail — kein Passwort nötig.
        </p>
      </div>

      {sent ? (
        <div
          className="rounded-lg p-4 text-sm"
          style={{
            background: "var(--color-accent-soft)",
            color: "var(--color-text)",
            border: "1px solid var(--color-accent)",
          }}
        >
          <p className="font-medium mb-1">E-Mail ist unterwegs.</p>
          <p style={{ color: "var(--color-muted)" }}>
            Prüfe dein Postfach — der Link meldet dich direkt an. Falls nichts ankommt, schau im
            Spam-Ordner nach.
          </p>
        </div>
      ) : (
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
              autoFocus
              className="min-h-[44px] px-3 rounded-lg text-sm"
              style={{
                border: "1px solid var(--color-line)",
                background: "var(--color-bg)",
                color: "var(--color-text)",
              }}
              placeholder="name@beispiel.de"
            />
          </div>

          {displayError && (
            <p className="text-sm" style={{ color: "var(--color-danger)" }}>
              {displayError}
              {urlErrorReason && !error ? (
                <span
                  className="block mt-1 text-xs"
                  style={{ color: "var(--color-muted)" }}
                >
                  Details: {urlErrorReason}
                </span>
              ) : null}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="min-h-[44px] rounded-lg text-sm font-medium gradient-accent"
            style={{ color: "var(--color-accent-text)", opacity: loading ? 0.6 : 1 }}
          >
            {loading ? "Wird gesendet..." : "Login-Link senden"}
          </button>
        </form>
      )}

      <p className="text-center text-sm mt-4" style={{ color: "var(--color-muted)" }}>
        Noch kein Konto?{" "}
        <Link href="/auth/registrieren" className="font-medium" style={{ color: "var(--color-accent)" }}>
          Registrieren
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
