"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createTextSource, createTranscriptSource, createPdfSource, createRecordingSource } from "@/app/actions";
import AudioRecorder from "@/components/audio-recorder";
import { card, btn, input, page, styles } from "@/components/ui/table-classes";

type SourceType = "text" | "transcript" | "pdf" | "recording";

const TABS: { id: SourceType; label: string }[] = [
  { id: "text", label: "Text" },
  { id: "transcript", label: "Transkript" },
  { id: "pdf", label: "PDF" },
  { id: "recording", label: "Aufnahme" },
];

type EntityOption = { id: string; name: string };

const LINK_TYPE_LABELS: Record<string, string> = {
  "": "— Keine —",
  company: "Unternehmen",
  contact: "Kontakt",
  project: "Projekt",
};

export default function NewSourcePage() {
  const [activeTab, setActiveTab] = useState<SourceType>("text");
  const [pending, setPending] = useState(false);
  const [pdfProgress, setPdfProgress] = useState("");
  const router = useRouter();

  // Recording state
  const audioBlob = useRef<Blob | null>(null);
  const [hasRecording, setHasRecording] = useState(false);

  // Entity linking (for recording tab)
  const [linkType, setLinkType] = useState("");
  const [linkId, setLinkId] = useState("");
  const [entities, setEntities] = useState<EntityOption[]>([]);

  const loadEntities = useCallback(async (type: string) => {
    if (!type) { setEntities([]); return; }
    try {
      const { getEntitiesForLinking } = await import("@/app/sources/import/entity-loader");
      const list = await getEntitiesForLinking(type);
      setEntities(list);
    } catch { setEntities([]); }
  }, []);

  const handleRecordingComplete = useCallback((blob: Blob) => {
    audioBlob.current = blob;
    setHasRecording(true);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setPdfProgress("");
    try {
      const fd = new FormData(e.currentTarget);

      if (activeTab === "recording") {
        if (!audioBlob.current) return;
        const audioFile = new File([audioBlob.current], "recording.webm", {
          type: audioBlob.current.type || "audio/webm",
        });
        fd.set("audio", audioFile);
        if (linkType) fd.set("linkType", linkType);
        if (linkId) fd.set("linkId", linkId);
        await createRecordingSource(fd);
        return;
      } else if (activeTab === "pdf") {
        const fileInput = e.currentTarget.querySelector('input[type="file"]') as HTMLInputElement;
        const files = fileInput?.files;
        if (files && files.length > 1) {
          // Multi-PDF upload
          for (let i = 0; i < files.length; i++) {
            setPdfProgress(`${i + 1} von ${files.length} …`);
            const singleFd = new FormData();
            singleFd.set("title", files[i].name.replace(/\.pdf$/i, ""));
            singleFd.set("description", "");
            singleFd.set("file", files[i]);
            await createPdfSource(singleFd);
          }
          setPdfProgress("");
          router.push("/sources");
          return;
        }
        await createPdfSource(fd);
      } else if (activeTab === "text") {
        await createTextSource(fd);
      } else {
        await createTranscriptSource(fd);
      }
    } catch {
      // redirect throws
    } finally {
      setPending(false);
      setPdfProgress("");
    }
  }

  return (
    <div className={page.narrow}>
      <div className="animate-fade-in">
        <Link href="/sources" className="text-xs font-medium mb-2 inline-block" style={{ color: "var(--color-accent)" }}>
          ← Zurück zu Quellen
        </Link>
        <h1 className="text-2xl font-semibold" style={styles.title}>
          Neue Quelle
        </h1>
        <p className="text-sm mt-0.5" style={styles.muted}>
          Inhalt hinzufügen und automatisch indexieren.
        </p>
      </div>

      {/* Type tabs */}
      <div
        className="flex gap-1 p-1 rounded-[var(--radius-card)] animate-fade-in"
        style={{ background: "var(--color-bg-elevated)" }}
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 rounded-[var(--radius-md)] text-sm font-medium py-2.5 transition-all min-h-[44px]"
            style={{
              background: activeTab === tab.id ? "var(--color-panel-strong)" : "transparent",
              color: activeTab === tab.id ? "var(--color-text)" : "var(--color-muted)",
              boxShadow: activeTab === tab.id ? "var(--shadow-sm)" : "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className={`${card.base} flex flex-col gap-5 animate-slide-up`} style={styles.panel}>
        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Titel *</label>
          <input name="title" required placeholder="z. B. Kundenpräsentation Q2" className={input.base} style={styles.input} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={input.label} style={{ color: "var(--color-text)" }}>Beschreibung</label>
          <input name="description" placeholder="Kurze Beschreibung (optional)" className={input.base} style={styles.input} />
        </div>

        {(activeTab === "text" || activeTab === "transcript") && (
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              {activeTab === "transcript" ? "Transkript" : "Text"} *
            </label>
            <textarea
              name="raw_text"
              required
              rows={10}
              placeholder={activeTab === "transcript" ? "Transkript einfügen …" : "Text einfügen …"}
              className={input.textarea}
              style={{ ...styles.input, minHeight: "200px" }}
            />
          </div>
        )}

        {activeTab === "pdf" && (
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>PDF-Datei *</label>
            <div
              className="rounded-[var(--radius-md)] border-2 border-dashed p-6 text-center transition-colors"
              style={{ borderColor: "var(--color-line)", background: "var(--color-bg)" }}
            >
              <input
                name="file"
                type="file"
                accept="application/pdf"
                multiple
                required
                className="text-sm cursor-pointer min-h-[44px]"
                style={{ color: "var(--color-text)" }}
              />
              <p className="text-xs mt-2" style={styles.muted}>
                Max. 10 MB pro Datei · Mehrere PDFs möglich · Text wird automatisch extrahiert
              </p>
              {pdfProgress && (
                <p className="text-xs mt-1 font-medium" style={{ color: "var(--color-accent)" }}>
                  Verarbeite PDF {pdfProgress}
                </p>
              )}
            </div>
          </div>
        )}

        {activeTab === "recording" && (
          <div className="flex flex-col gap-4">
            <AudioRecorder onRecordingComplete={handleRecordingComplete} disabled={pending} />

            {/* Entity linking */}
            <div className="flex flex-col gap-1.5">
              <label className={input.label} style={{ color: "var(--color-text)" }}>
                Verknüpfen mit (optional)
              </label>
              <p className="text-xs" style={styles.muted}>
                Aufnahme mit einem Unternehmen, Kontakt oder Projekt verknüpfen.
              </p>
              <div className="flex gap-2 flex-col sm:flex-row">
                <select
                  value={linkType}
                  onChange={(e) => {
                    const type = e.target.value;
                    setLinkType(type);
                    setLinkId("");
                    loadEntities(type);
                  }}
                  className={input.base}
                  style={{ ...styles.input, maxWidth: "180px" }}
                >
                  {Object.entries(LINK_TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                {linkType && (
                  <select
                    value={linkId}
                    onChange={(e) => setLinkId(e.target.value)}
                    className={input.base}
                    style={{ ...styles.input, flex: 1 }}
                  >
                    <option value="">— Auswählen —</option>
                    {entities.map((ent) => (
                      <option key={ent.id} value={ent.id}>{ent.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={pending || (activeTab === "recording" && !hasRecording)}
            className={btn.primary}
            style={{ ...styles.accent, opacity: (pending || (activeTab === "recording" && !hasRecording)) ? 0.5 : 1 }}
          >
            {pending ? "Wird verarbeitet …" : activeTab === "recording" ? "Transkribieren & Speichern" : "Quelle hinzufügen"}
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
