"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTextSource, createTranscriptSource, createPdfSource } from "@/app/actions";
import { card, btn, input } from "@/components/ui/table-classes";

type SourceType = "text" | "transcript" | "pdf";

const TABS: { id: SourceType; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "transcript", label: "Transkript" },
  { id: "pdf", label: "PDF" },
];

export default function NewSourcePage() {
  const [activeTab, setActiveTab] = useState<SourceType>("text");
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    try {
      const formData = new FormData(e.currentTarget);
      if (activeTab === "text") await createTextSource(formData);
      else if (activeTab === "transcript") await createTranscriptSource(formData);
      else await createPdfSource(formData);
    } catch {
      // redirect throws — this is expected
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8 max-w-2xl">
      {/* Header */}
      <div>
        <h1
          className="text-2xl font-semibold leading-tight"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Neue Quelle
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
          Inhalt hinzufügen und in die Wissensbasis aufnehmen.
        </p>
      </div>

      {/* Type tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl"
        style={{ background: "var(--color-line)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 rounded-lg text-sm font-medium py-2 transition-colors min-h-[44px]"
            style={{
              background: activeTab === tab.id ? "var(--color-panel-strong)" : "transparent",
              color: activeTab === tab.id ? "var(--color-text)" : "var(--color-muted)",
              boxShadow: activeTab === tab.id ? "var(--shadow-card)" : "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className={`${card.base} flex flex-col gap-5`}
        style={{
          background: "var(--color-panel)",
          border: "1px solid var(--color-line)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {/* Common fields */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Titel *
          </label>
          <input
            name="title"
            required
            placeholder="z. B. Kundenpräsentation Q2"
            className={input.base}
            style={{
              borderColor: "var(--color-line)",
              background: "var(--color-panel-strong)",
              color: "var(--color-text)",
            }}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Beschreibung
          </label>
          <input
            name="description"
            placeholder="Kurze Beschreibung (optional)"
            className={input.base}
            style={{
              borderColor: "var(--color-line)",
              background: "var(--color-panel-strong)",
              color: "var(--color-text)",
            }}
          />
        </div>

        {/* Text / Transcript content */}
        {(activeTab === "text" || activeTab === "transcript") && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              {activeTab === "transcript" ? "Transkript" : "Text"} *
            </label>
            <textarea
              name="raw_text"
              required
              rows={12}
              placeholder={
                activeTab === "transcript"
                  ? "Füge hier das vollständige Transkript ein …"
                  : "Füge hier deinen Text ein …"
              }
              className={input.textarea}
              style={{
                borderColor: "var(--color-line)",
                background: "var(--color-panel-strong)",
                color: "var(--color-text)",
                minHeight: "220px",
              }}
            />
          </div>
        )}

        {/* PDF upload */}
        {activeTab === "pdf" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              PDF-Datei *
            </label>
            <input
              name="file"
              type="file"
              accept="application/pdf"
              required
              className="text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium cursor-pointer min-h-[44px] flex items-center"
              style={{
                color: "var(--color-text)",
              }}
            />
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              Maximale Größe: 10 MB. Text wird automatisch extrahiert.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="submit"
            disabled={pending}
            className={btn.primary}
            style={{
              background: "var(--color-accent)",
              color: "#fff",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Wird gespeichert …" : "Quelle hinzufügen"}
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
