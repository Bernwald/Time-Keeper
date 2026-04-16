"use client";

import { useState, useTransition } from "react";
import { submitReview, type Verdict, type RootCause } from "../actions";

type Props = {
  messageId: string;
  initialVerdict: Verdict | null;
  initialRootCause: RootCause | null;
  initialNotes: string;
};

const VERDICTS: Array<{ value: Verdict; label: string; tone: "ok" | "warn" | "bad" | "neutral" }> = [
  { value: "correct", label: "Korrekt", tone: "ok" },
  { value: "partial", label: "Teilweise korrekt", tone: "warn" },
  { value: "hallucination", label: "Halluziniert", tone: "bad" },
  { value: "empty", label: "Keine Antwort", tone: "neutral" },
];

const CAUSES: Array<{ value: RootCause; label: string }> = [
  { value: "data_quality", label: "Datenqualität (Quelle fehlt / schlecht)" },
  { value: "retrieval", label: "Retrieval (falsche/zu wenige Chunks)" },
  { value: "prompt", label: "System-Prompt (falsche Anweisung)" },
  { value: "llm", label: "LLM (Modell hat halluziniert trotz Kontext)" },
  { value: "out_of_scope", label: "Außerhalb Scope (Frage nicht beantwortbar)" },
  { value: "ambiguous_question", label: "Frage unklar formuliert" },
];

export default function ReviewForm({
  messageId,
  initialVerdict,
  initialRootCause,
  initialNotes,
}: Props) {
  const [verdict, setVerdict] = useState<Verdict | null>(initialVerdict);
  const [rootCause, setRootCause] = useState<RootCause | null>(initialRootCause);
  const [notes, setNotes] = useState(initialNotes);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const showCause = verdict !== null && verdict !== "correct";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!verdict) {
      setError("Bitte eine Bewertung wählen.");
      return;
    }
    if (showCause && !rootCause) {
      setError("Bitte eine Ursache wählen.");
      return;
    }
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await submitReview({
          messageId,
          verdict,
          rootCause: verdict === "correct" ? null : rootCause,
          notes,
        });
        setSaved(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-xl p-5"
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-line)",
      }}
    >
      <h3
        className="text-base font-semibold"
        style={{ color: "var(--color-text)" }}
      >
        Bewertung
      </h3>

      {/* Verdict */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm mb-1" style={{ color: "var(--color-muted)" }}>
          Ergebnis
        </legend>
        <div className="flex flex-wrap gap-2">
          {VERDICTS.map((v) => (
            <VerdictButton
              key={v.value}
              label={v.label}
              selected={verdict === v.value}
              tone={v.tone}
              onClick={() => setVerdict(v.value)}
            />
          ))}
        </div>
      </fieldset>

      {/* Root cause */}
      {showCause && (
        <fieldset className="flex flex-col gap-2">
          <legend
            className="text-sm mb-1"
            style={{ color: "var(--color-muted)" }}
          >
            Ursache
          </legend>
          <div className="flex flex-col gap-2">
            {CAUSES.map((c) => (
              <label
                key={c.value}
                className="flex items-center gap-2 min-h-[36px] px-3 rounded-lg cursor-pointer"
                style={{
                  background:
                    rootCause === c.value
                      ? "var(--color-accent-soft)"
                      : "var(--color-bg)",
                  border:
                    rootCause === c.value
                      ? "1px solid var(--color-accent)"
                      : "1px solid transparent",
                }}
              >
                <input
                  type="radio"
                  name="root_cause"
                  value={c.value}
                  checked={rootCause === c.value}
                  onChange={() => setRootCause(c.value)}
                />
                <span
                  className="text-sm"
                  style={{ color: "var(--color-text)" }}
                >
                  {c.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Notes */}
      <label className="flex flex-col gap-1">
        <span className="text-sm" style={{ color: "var(--color-muted)" }}>
          Notiz (optional)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="z. B. Welcher Chunk fehlte, was war falsch?"
          className="p-3 rounded-lg text-sm"
          style={{
            background: "var(--color-bg)",
            color: "var(--color-text)",
            border: "1px solid var(--color-line)",
          }}
        />
      </label>

      {error && (
        <p className="text-sm" style={{ color: "var(--color-danger, #b91c1c)" }}>
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="text-sm" style={{ color: "var(--color-accent)" }}>
          Gespeichert.
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="min-h-[44px] px-5 rounded-lg text-sm font-medium"
          style={{
            background: "var(--color-accent)",
            color: "var(--color-on-accent, #fff)",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          {isPending ? "Speichere …" : initialVerdict ? "Aktualisieren" : "Bewertung speichern"}
        </button>
        {initialVerdict && (
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            Du hast diese Message bereits bewertet — Speichern überschreibt deine vorherige Bewertung.
          </span>
        )}
      </div>
    </form>
  );
}

function VerdictButton({
  label,
  selected,
  tone,
  onClick,
}: {
  label: string;
  selected: boolean;
  tone: "ok" | "warn" | "bad" | "neutral";
  onClick: () => void;
}) {
  // Tokens only — tone mappt auf bestehende Farb-Variablen.
  const bg = selected
    ? tone === "ok"
      ? "var(--color-accent)"
      : tone === "warn"
        ? "var(--color-warning, var(--color-accent))"
        : tone === "bad"
          ? "var(--color-danger, var(--color-accent))"
          : "var(--color-text-secondary)"
    : "var(--color-bg)";
  const color = selected ? "var(--color-on-accent, #fff)" : "var(--color-text)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] px-4 rounded-lg text-sm font-medium"
      style={{
        background: bg,
        color,
        border: "1px solid var(--color-line)",
      }}
    >
      {label}
    </button>
  );
}
