"use client";

import { useState, useTransition, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { batchImportSources } from "@/app/actions";
import type { ImportRow, BatchImportResult } from "@/app/actions";
import { parseCsv, detectDelimiter, parseJsonArray } from "@/lib/content/csv-parser";
import type { ParsedData } from "@/lib/content/csv-parser";
import { card, badge, btn, input, page, styles } from "@/components/ui/table-classes";

type FileFormat = "csv" | "json";
type Step = "upload" | "mapping" | "preview" | "importing" | "done";

type MappingConfig = {
  titleColumn: string;
  contentColumns: string[];
  sourceType: string;
  linkType: string;
  linkId: string;
};

// Lightweight entity lists fetched via server action
type EntityOption = { id: string; name: string };

const LINK_TYPE_LABELS: Record<string, string> = {
  "": "— Keine —",
  company: "Unternehmen",
  contact: "Kontakt",
  project: "Projekt",
};

export default function ImportPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [format, setFormat] = useState<FileFormat>("csv");
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<MappingConfig>({
    titleColumn: "",
    contentColumns: [],
    sourceType: "text",
    linkType: "",
    linkId: "",
  });
  const [result, setResult] = useState<BatchImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  // Entity lists for linking (loaded on demand)
  const [entities, setEntities] = useState<EntityOption[]>([]);

  const loadEntities = useCallback(async (type: string) => {
    if (!type) {
      setEntities([]);
      return;
    }
    try {
      const { getEntitiesForLinking } = await import("./entity-loader");
      const list = await getEntitiesForLinking(type);
      setEntities(list);
    } catch {
      setEntities([]);
    }
  }, []);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const isExcel = /\.xlsx?$/i.test(file.name);
    const isJson = /\.json$/i.test(file.name);

    try {
      let data: ParsedData;

      if (isExcel) {
        const { parseExcel } = await import("@/lib/content/csv-parser");
        const buffer = await file.arrayBuffer();
        data = await parseExcel(buffer);
        setFormat("csv"); // treat as tabular
      } else if (isJson) {
        const text = await file.text();
        data = parseJsonArray(text);
        setFormat("json");
      } else {
        const text = await file.text();
        const delimiter = detectDelimiter(text);
        data = parseCsv(text, delimiter);
        setFormat("csv");
      }

      if (data.headers.length === 0 || data.rows.length === 0) {
        alert("Datei enthält keine verwertbaren Daten.");
        return;
      }

      setParsed(data);
      setMapping((m) => ({
        ...m,
        titleColumn: data.headers[0] ?? "",
        contentColumns: data.headers.length > 1 ? [data.headers[1]] : [data.headers[0]],
      }));
      setStep("mapping");
    } catch {
      alert("Fehler beim Lesen der Datei.");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const input = document.createElement("input");
      input.type = "file";
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      handleFileUpload({ target: input } as unknown as React.ChangeEvent<HTMLInputElement>);
    }
  }

  function toggleContentColumn(header: string) {
    setMapping((m) => ({
      ...m,
      contentColumns: m.contentColumns.includes(header)
        ? m.contentColumns.filter((c) => c !== header)
        : [...m.contentColumns, header],
    }));
  }

  function buildRows(): ImportRow[] {
    if (!parsed) return [];
    return parsed.rows.map((row) => {
      const content = mapping.contentColumns.length === 1
        ? (row[mapping.contentColumns[0]] ?? "")
        : mapping.contentColumns
            .map((col) => {
              const val = (row[col] ?? "").trim();
              return val ? `### ${col}\n${val}` : "";
            })
            .filter(Boolean)
            .join("\n\n");

      return {
        title: row[mapping.titleColumn] ?? "Ohne Titel",
        content,
        sourceType: mapping.sourceType,
        columnNames: mapping.contentColumns.length > 1 ? mapping.contentColumns : undefined,
        linkType: mapping.linkType || undefined,
        linkId: mapping.linkId || undefined,
      };
    });
  }

  function handleStartImport() {
    const rows = buildRows();
    if (rows.length === 0) return;

    setStep("importing");
    startTransition(async () => {
      const res = await batchImportSources(rows);
      setResult(res);
      setStep("done");
    });
  }

  const previewRows = parsed?.rows.slice(0, 3) ?? [];

  return (
    <div className={page.narrow}>
      <div className="animate-fade-in">
        <Link href="/sources" className="text-xs font-medium mb-2 inline-block" style={{ color: "var(--color-accent)" }}>
          ← Zurück zu Quellen
        </Link>
        <h1 className="text-2xl font-semibold" style={styles.title}>
          Daten importieren
        </h1>
        <p className="text-sm mt-0.5" style={styles.muted}>
          CSV, Excel oder JSON hochladen — Spalten zuordnen — automatisch indexieren.
        </p>
      </div>

      <div
        className="rounded-[var(--radius-md)] border px-4 py-3 text-sm"
        style={{
          background: "var(--color-bg-elevated)",
          borderColor: "var(--color-line)",
          color: "var(--color-text)",
        }}
      >
        <strong style={{ color: "var(--color-accent)" }}>Hinweis:</strong>{" "}
        Dieser Import-Pfad wird abgeloest. Verbinde stattdessen{" "}
        <Link href="/quellen" className="underline" style={{ color: "var(--color-accent)" }}>
          SharePoint oder Drive
        </Link>
        {" "}— deine Daten bleiben dann automatisch aktuell.
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs" style={styles.muted}>
        {["Datei wählen", "Zuordnung", "Vorschau", "Import"].map((label, i) => {
          const stepIndex = ["upload", "mapping", "preview", "importing"].indexOf(step);
          const active = i <= stepIndex || step === "done";
          return (
            <div key={label} className="flex items-center gap-2">
              {i > 0 && <span style={{ color: "var(--color-line)" }}>→</span>}
              <span
                className="font-medium"
                style={{ color: active ? "var(--color-accent)" : "var(--color-muted)" }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <div
          className={`${card.base} flex flex-col items-center gap-4 py-12 border-2 border-dashed animate-slide-up cursor-pointer`}
          style={{ borderColor: "var(--color-line)", background: "var(--color-bg)" }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl"
            style={styles.accentSoft}
          >
            ↑
          </div>
          <div className="text-center">
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              Datei hierher ziehen oder klicken
            </p>
            <p className="text-xs mt-1" style={styles.muted}>
              CSV · Excel (.xlsx) · JSON
            </p>
          </div>
          <input
            id="file-input"
            type="file"
            accept=".csv,.tsv,.xlsx,.xls,.json"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      )}

      {/* Step: Mapping */}
      {step === "mapping" && parsed && (
        <div className={`${card.base} flex flex-col gap-5 animate-slide-up`} style={styles.panel}>
          <div className="flex items-center gap-2">
            <span className={badge.pill} style={styles.accentSoft}>{fileName}</span>
            <span className="text-xs" style={styles.muted}>
              {parsed.rows.length} Zeilen · {parsed.headers.length} Spalten
            </span>
          </div>

          {/* Title column */}
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Titel-Spalte *
            </label>
            <p className="text-xs" style={styles.muted}>Welche Spalte wird zum Titel jeder Quelle?</p>
            <select
              value={mapping.titleColumn}
              onChange={(e) => setMapping((m) => ({ ...m, titleColumn: e.target.value }))}
              className={input.base}
              style={styles.input}
            >
              {parsed.headers.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
          </div>

          {/* Content columns */}
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Inhalt-Spalte(n) *
            </label>
            <p className="text-xs" style={styles.muted}>
              Welche Spalte(n) enthalten den Text? Mehrere werden zusammengefügt.
            </p>
            <div className="flex flex-wrap gap-2">
              {parsed.headers.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => toggleContentColumn(h)}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-all min-h-[36px]"
                  style={{
                    background: mapping.contentColumns.includes(h) ? "var(--color-accent)" : "var(--color-bg-elevated)",
                    color: mapping.contentColumns.includes(h) ? "var(--color-accent-text)" : "var(--color-muted)",
                  }}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Source type */}
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>Quelltyp</label>
            <select
              value={mapping.sourceType}
              onChange={(e) => setMapping((m) => ({ ...m, sourceType: e.target.value }))}
              className={input.base}
              style={{ ...styles.input, maxWidth: "200px" }}
            >
              <option value="text">Text</option>
              <option value="transcript">Transkript</option>
              <option value="email">E-Mail</option>
              <option value="report">Bericht</option>
              <option value="note">Notiz</option>
            </select>
          </div>

          {/* Entity linking */}
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Alle verknüpfen mit (optional)
            </label>
            <p className="text-xs" style={styles.muted}>
              Verknüpft alle importierten Quellen mit einem Unternehmen, Kontakt oder Projekt.
            </p>
            <div className="flex gap-2 flex-col sm:flex-row">
              <select
                value={mapping.linkType}
                onChange={(e) => {
                  const type = e.target.value;
                  setMapping((m) => ({ ...m, linkType: type, linkId: "" }));
                  loadEntities(type);
                }}
                className={input.base}
                style={{ ...styles.input, maxWidth: "180px" }}
              >
                {Object.entries(LINK_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              {mapping.linkType && (
                <select
                  value={mapping.linkId}
                  onChange={(e) => setMapping((m) => ({ ...m, linkId: e.target.value }))}
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

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep("preview")}
              disabled={mapping.contentColumns.length === 0}
              className={btn.primary}
              style={{
                ...styles.accent,
                opacity: mapping.contentColumns.length === 0 ? 0.5 : 1,
              }}
            >
              Vorschau →
            </button>
            <button
              type="button"
              onClick={() => { setStep("upload"); setParsed(null); }}
              className={btn.ghost}
              style={{ color: "var(--color-muted)" }}
            >
              Andere Datei
            </button>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === "preview" && parsed && (
        <div className="flex flex-col gap-4 animate-slide-up">
          <div className={`${card.base} flex flex-col gap-3`} style={styles.panel}>
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Vorschau (erste 3 von {parsed.rows.length})
            </h2>

            {previewRows.map((row, i) => {
              const title = row[mapping.titleColumn] ?? "—";
              const content = mapping.contentColumns.length === 1
                ? (row[mapping.contentColumns[0]] ?? "")
                : mapping.contentColumns
                    .map((col) => {
                      const val = (row[col] ?? "").trim();
                      return val ? `### ${col}\n${val}` : "";
                    })
                    .filter(Boolean)
                    .join("\n\n");

              return (
                <div key={i} className={card.flat} style={{ ...styles.panel, borderColor: "var(--color-line-soft)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{title}</p>
                  <p className="text-xs mt-1 line-clamp-3" style={styles.muted}>
                    {content.slice(0, 200)}{content.length > 200 ? " …" : ""}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className={badge.pill} style={styles.accentSoft}>
              {parsed.rows.length} Quellen
            </span>
            <span className={badge.pill} style={{ background: "var(--color-bg-elevated)", color: "var(--color-muted)" }}>
              Typ: {mapping.sourceType}
            </span>
            {mapping.linkType && mapping.linkId && (
              <span className={badge.pill} style={styles.accentSoft}>
                Verknüpft mit {LINK_TYPE_LABELS[mapping.linkType]}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleStartImport}
              className={btn.primary}
              style={styles.accent}
            >
              {parsed.rows.length} Quellen importieren
            </button>
            <button
              type="button"
              onClick={() => setStep("mapping")}
              className={btn.ghost}
              style={{ color: "var(--color-muted)" }}
            >
              ← Zurück
            </button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === "importing" && (
        <div className={`${card.base} flex flex-col items-center gap-4 py-12 animate-fade-in`} style={styles.panel}>
          <div className="flex gap-1">
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--color-accent)" }} />
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--color-accent)", animationDelay: "150ms" }} />
            <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--color-accent)", animationDelay: "300ms" }} />
          </div>
          <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
            Import läuft …
          </p>
          <p className="text-xs" style={styles.muted}>
            Quellen werden angelegt, Text aufgeteilt und Embeddings generiert.
          </p>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && result && (
        <div className={`${card.base} flex flex-col gap-4 animate-slide-up`} style={styles.panel}>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-lg"
              style={result.errors.length === 0 ? styles.accentSoft : styles.warning}
            >
              {result.errors.length === 0 ? "✓" : "!"}
            </div>
            <div>
              <p className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
                {result.imported} von {result.total} importiert
              </p>
              {result.errors.length > 0 && (
                <p className="text-xs" style={{ color: "var(--color-warning)" }}>
                  {result.errors.length} Fehler
                </p>
              )}
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="flex flex-col gap-1 text-xs" style={{ color: "var(--color-danger)" }}>
              {result.errors.slice(0, 5).map((err, i) => (
                <p key={i}>{err}</p>
              ))}
              {result.errors.length > 5 && (
                <p>… und {result.errors.length - 5} weitere</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Link href="/sources" className={btn.primary} style={styles.accent}>
              Zu den Quellen
            </Link>
            <button
              type="button"
              onClick={() => { setStep("upload"); setParsed(null); setResult(null); }}
              className={btn.ghost}
              style={{ color: "var(--color-muted)" }}
            >
              Weiteren Import starten
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
