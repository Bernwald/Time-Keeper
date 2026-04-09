import Link from "next/link";
import { listSources, type Source } from "@/lib/db/queries/sources";
import { card, badge, btn, page, styles } from "@/components/ui/table-classes";
import { RetryButton } from "@/app/quellen/retry-button";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ready: "Bereit",
  processing: "Verarbeitung",
  pending: "Ausstehend",
  error: "Fehler",
};
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  ready: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  processing: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  pending: { bg: "var(--color-bg-elevated)", color: "var(--color-muted)" },
  error: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
};

// Group label per (connector_type ?? source_type). Connector files keep their
// provider label so the user immediately sees where a file came from.
const GROUP_LABEL: Record<string, string> = {
  gdrive: "Google Drive",
  sharepoint: "Microsoft SharePoint",
  text: "Text",
  transcript: "Transkripte",
  pdf: "PDF",
  recording: "Aufnahmen",
  connector: "Connector",
  entity: "Sonstige",
};

const GROUP_ORDER = [
  "gdrive",
  "sharepoint",
  "pdf",
  "text",
  "transcript",
  "recording",
  "connector",
  "entity",
];

function groupKey(s: Source): string {
  if (s.connector_type) return s.connector_type;
  return s.source_type ?? "entity";
}

export default async function SourcesPage() {
  const sources = await listSources();

  // Group by connector / source type so the user can scan by origin.
  const groups = new Map<string, Source[]>();
  for (const s of sources) {
    const k = groupKey(s);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }
  const orderedGroups = [...groups.entries()].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a[0]);
    const bi = GROUP_ORDER.indexOf(b[0]);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className={page.wrapper}>
      <div className={page.headerRow}>
        <div className={`${page.header} animate-fade-in`}>
          <h1 className="text-2xl md:text-3xl font-semibold" style={styles.title}>
            Dateien
          </h1>
          <p className="text-sm" style={styles.muted}>
            {sources.length} {sources.length === 1 ? "Datei" : "Dateien"} ·{" "}
            {orderedGroups.length} Quelle{orderedGroups.length === 1 ? "" : "n"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sources/import"
            className={btn.secondary}
            style={{ background: "var(--color-bg-elevated)", color: "var(--color-text)" }}
          >
            Bulk-Import
          </Link>
          <Link href="/sources/new" className={btn.primary} style={styles.accent}>
            + Neue Quelle
          </Link>
        </div>
      </div>

      {sources.length === 0 && (
        <div
          className={`${card.base} flex flex-col items-center justify-center gap-3 py-12 md:py-16 text-center animate-scale-in`}
          style={styles.panel}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
            style={styles.accentSoft}
          >
            +
          </div>
          <p className="text-base font-medium" style={{ color: "var(--color-text)" }}>
            Noch keine Quellen vorhanden
          </p>
          <p className="text-sm max-w-xs" style={styles.muted}>
            Füge Texte, Transkripte oder PDFs hinzu, um die Wissensbasis aufzubauen.
          </p>
          <Link
            href="/sources/new"
            className={btn.primary}
            style={{ ...styles.accent, marginTop: "0.25rem" }}
          >
            Erste Quelle hinzufügen
          </Link>
        </div>
      )}

      {sources.length > 0 && (
        <div className="flex flex-col gap-3">
          {orderedGroups.map(([key, items]) => {
            const readyCount = items.filter((i) => i.status === "ready").length;
            const errorCount = items.filter((i) => i.status === "error").length;
            return (
              <details
                key={key}
                open
                className={card.flat + " group"}
                style={styles.panel}
              >
                <summary
                  className="cursor-pointer list-none flex items-center justify-between gap-3 min-h-[44px] select-none"
                  style={{ color: "var(--color-text)" }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="text-[10px] transition-transform group-open:rotate-180"
                      aria-hidden
                    >
                      ▾
                    </span>
                    <span
                      className="text-sm font-semibold truncate"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {GROUP_LABEL[key] ?? key}
                    </span>
                    <span className="text-xs" style={styles.muted}>
                      {items.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs" style={styles.muted}>
                    <span>{readyCount} bereit</span>
                    {errorCount > 0 && (
                      <span style={{ color: "var(--color-danger)" }}>
                        · {errorCount} Fehler
                      </span>
                    )}
                  </div>
                </summary>

                <ul className="flex flex-col mt-3 divide-y" style={{ borderColor: "var(--color-border)" }}>
                  {items.map((s) => {
                    const sStyle = STATUS_STYLE[s.status] ?? STATUS_STYLE.pending;
                    const isConnector = !!s.connector_type;
                    return (
                      <li
                        key={s.id}
                        className="flex items-center gap-3 py-2 min-h-[44px]"
                      >
                        <Link
                          href={`/sources/${s.id}`}
                          className="flex-1 min-w-0 flex items-center gap-3"
                        >
                          <span
                            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: sStyle.color }}
                          />
                          <span
                            className="text-sm truncate"
                            style={{ color: "var(--color-text)" }}
                          >
                            {s.title}
                          </span>
                          <span
                            className={badge.pill}
                            style={{ background: sStyle.bg, color: sStyle.color }}
                          >
                            {STATUS_LABEL[s.status] ?? s.status}
                          </span>
                          {s.word_count != null && (
                            <span className="text-[11px] hidden md:inline" style={styles.muted}>
                              {s.word_count.toLocaleString("de-DE")} W
                            </span>
                          )}
                          <span
                            className="text-[11px] ml-auto pl-2 flex-shrink-0"
                            style={styles.muted}
                          >
                            {new Date(s.created_at).toLocaleDateString("de-DE", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                        </Link>
                        {isConnector && <RetryButton sourceId={s.id} />}
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
