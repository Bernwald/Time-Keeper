"use client";

import Link from "next/link";
import { useState } from "react";
import { createProcessTemplate } from "@/app/actions";
import { PROCESS_CATEGORIES, RESPONSIBLE_ROLES } from "@/lib/constants/processes";
import { card, btn, input, page, styles } from "@/components/ui/table-classes";

type StepDraft = {
  name: string;
  description: string;
  expected_duration_days: string;
  responsible_role: string;
};

const emptyStep = (): StepDraft => ({
  name: "",
  description: "",
  expected_duration_days: "",
  responsible_role: "consultant",
});

export default function NewTemplatePage() {
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);

  function addStep() {
    setSteps((prev) => [...prev, emptyStep()]);
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  }

  function updateStep(index: number, field: keyof StepDraft, value: string) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)),
    );
  }

  function moveStep(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= steps.length) return;
    setSteps((prev) => {
      const copy = [...prev];
      [copy[index], copy[newIndex]] = [copy[newIndex], copy[index]];
      return copy;
    });
  }

  return (
    <div className={page.narrow}>
      <Link
        href="/processes"
        className="text-xs font-medium inline-block animate-fade-in"
        style={{ color: "var(--color-accent)" }}
      >
        &larr; Alle Prozesse
      </Link>

      <h1 className="text-xl md:text-2xl font-semibold animate-fade-in" style={styles.title}>
        Neue Prozessvorlage
      </h1>

      <form
        action={(formData) => {
          const stepsData = steps
            .filter((s) => s.name.trim())
            .map((s) => ({
              name: s.name.trim(),
              description: s.description.trim() || undefined,
              expected_duration_days: s.expected_duration_days
                ? parseInt(s.expected_duration_days, 10)
                : undefined,
              responsible_role: s.responsible_role || undefined,
            }));
          formData.set("steps", JSON.stringify(stepsData));
          return createProcessTemplate(formData);
        }}
        className="flex flex-col gap-6 animate-slide-up"
      >
        {/* Template meta */}
        <div className={`${card.base} flex flex-col gap-5`} style={styles.panel}>
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Name *
            </label>
            <input
              name="name"
              required
              placeholder="z.B. Kundenonboarding"
              className={input.base}
              style={styles.input}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Beschreibung
            </label>
            <textarea
              name="description"
              rows={3}
              placeholder="Wofuer wird dieser Prozess verwendet?"
              className={input.textarea}
              style={styles.input}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Kategorie
            </label>
            <select name="category" className={input.base} style={styles.input}>
              <option value="">Keine Kategorie</option>
              {PROCESS_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Schritte
            </h2>
            <button
              type="button"
              onClick={addStep}
              className="text-xs font-medium min-h-[44px] px-3"
              style={{ color: "var(--color-accent)" }}
            >
              + Schritt hinzufuegen
            </button>
          </div>

          {steps.map((step, i) => (
            <div
              key={i}
              className={`${card.base} flex flex-col gap-3`}
              style={styles.panel}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-xs font-semibold"
                  style={{ color: "var(--color-placeholder)" }}
                >
                  Schritt {i + 1}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveStep(i, -1)}
                    disabled={i === 0}
                    className="text-xs px-2 min-h-[28px] min-w-[28px] rounded"
                    style={{ color: i === 0 ? "var(--color-placeholder)" : "var(--color-muted)" }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStep(i, 1)}
                    disabled={i === steps.length - 1}
                    className="text-xs px-2 min-h-[28px] min-w-[28px] rounded"
                    style={{ color: i === steps.length - 1 ? "var(--color-placeholder)" : "var(--color-muted)" }}
                  >
                    ↓
                  </button>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeStep(i)}
                      className="text-xs px-2 min-h-[28px] min-w-[28px] rounded"
                      style={{ color: "var(--color-danger)" }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              <input
                value={step.name}
                onChange={(e) => updateStep(i, "name", e.target.value)}
                placeholder="Schrittname *"
                className={input.base}
                style={styles.input}
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={step.expected_duration_days}
                  onChange={(e) => updateStep(i, "expected_duration_days", e.target.value)}
                  type="number"
                  min="0"
                  placeholder="Dauer (Tage)"
                  className={input.base}
                  style={styles.input}
                />
                <select
                  value={step.responsible_role}
                  onChange={(e) => updateStep(i, "responsible_role", e.target.value)}
                  className={input.base}
                  style={styles.input}
                >
                  {RESPONSIBLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className={btn.primary} style={styles.accent}>
            Vorlage erstellen
          </button>
        </div>
      </form>
    </div>
  );
}
