"use client";

import { useState, useTransition } from "react";
import { saveBranding } from "./actions";
import type { BrandingState } from "./page";
import { btn, input, styles } from "@/components/ui/table-classes";

export default function BrandingForm({ initial }: { initial: BrandingState }) {
  const [state, setState] = useState<BrandingState>(initial);
  const [doDont, setDoDont] = useState((initial.do_and_dont ?? []).join("\n"));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function update<K extends keyof BrandingState>(key: K, value: BrandingState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }
  function updateColor(key: keyof NonNullable<BrandingState["colors"]>, value: string) {
    setState((s) => ({ ...s, colors: { ...(s.colors ?? {}), [key]: value } }));
  }
  function updateFont(key: "heading" | "body", value: string) {
    setState((s) => ({ ...s, fonts: { ...(s.fonts ?? {}), [key]: value } }));
  }

  function handleSave() {
    startTransition(async () => {
      await saveBranding({
        ...state,
        do_and_dont: doDont.split("\n").map((l) => l.trim()).filter(Boolean),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  const colorFields: Array<{ key: keyof NonNullable<BrandingState["colors"]>; label: string }> = [
    { key: "primary", label: "Primaer" },
    { key: "secondary", label: "Sekundaer" },
    { key: "accent", label: "Akzent" },
    { key: "bg", label: "Hintergrund" },
    { key: "text", label: "Text" },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Logos */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Logo
        </h2>
        <Field label="Logo URL (Light)">
          <input
            value={state.logo_url ?? ""}
            onChange={(e) => update("logo_url", e.target.value)}
            placeholder="https://…"
            className={input.base}
            style={styles.input}
          />
        </Field>
        <Field label="Logo URL (Dark)">
          <input
            value={state.logo_dark_url ?? ""}
            onChange={(e) => update("logo_dark_url", e.target.value)}
            placeholder="https://…"
            className={input.base}
            style={styles.input}
          />
        </Field>
      </section>

      {/* Colors */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Farben
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {colorFields.map((f) => (
            <Field key={f.key} label={f.label}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={state.colors?.[f.key] ?? "#000000"}
                  onChange={(e) => updateColor(f.key, e.target.value)}
                  className="h-11 w-12 rounded-md border cursor-pointer"
                  style={{ borderColor: "var(--color-line)" }}
                />
                <input
                  value={state.colors?.[f.key] ?? ""}
                  onChange={(e) => updateColor(f.key, e.target.value)}
                  placeholder="#000000"
                  className={input.base}
                  style={{ ...styles.input, flex: 1 }}
                />
              </div>
            </Field>
          ))}
        </div>
      </section>

      {/* Fonts */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Schriften
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Headline-Font">
            <input
              value={state.fonts?.heading ?? ""}
              onChange={(e) => updateFont("heading", e.target.value)}
              placeholder="Fraunces"
              className={input.base}
              style={styles.input}
            />
          </Field>
          <Field label="Body-Font">
            <input
              value={state.fonts?.body ?? ""}
              onChange={(e) => updateFont("body", e.target.value)}
              placeholder="DM Sans"
              className={input.base}
              style={styles.input}
            />
          </Field>
        </div>
      </section>

      {/* Tone of voice */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Tonalitaet & Regeln
        </h2>
        <Field label="Tone of Voice">
          <textarea
            value={state.tone_of_voice ?? ""}
            onChange={(e) => update("tone_of_voice", e.target.value)}
            rows={3}
            placeholder="z.B. Direkt, fachlich, ohne Marketing-Floskeln"
            className={input.textarea}
            style={styles.input}
          />
        </Field>
        <Field label="Do's & Dont's (eine Regel pro Zeile)">
          <textarea
            value={doDont}
            onChange={(e) => setDoDont(e.target.value)}
            rows={5}
            placeholder={"Nutze immer das Logo oben links\nKeine Stockfotos\n…"}
            className={input.textarea}
            style={styles.input}
          />
        </Field>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={pending}
          className={btn.primary}
          style={{ ...styles.accent, opacity: pending ? 0.6 : 1 }}
        >
          {pending ? "Speichere …" : "Speichern"}
        </button>
        {saved && (
          <span className="text-sm" style={{ color: "var(--color-accent)" }}>
            Gespeichert.
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={input.label} style={{ color: "var(--color-text)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
