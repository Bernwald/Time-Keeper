import Link from "next/link";
import { listSources } from "@/lib/db/queries/sources";
import { card, badge, btn, page, styles } from "@/components/ui/table-classes";

export const dynamic = 'force-dynamic';

const TYPE_LABEL: Record<string, string> = { text: "Text", transcript: "Transkript", pdf: "PDF", recording: "Aufnahme" };
const STATUS_LABEL: Record<string, string> = { ready: "Bereit", processing: "Verarbeitung", pending: "Ausstehend", error: "Fehler" };
const TYPE_STYLE: Record<string, { bg: string; color: string }> = {
  text: { bg: "var(--color-accent-soft)", color: "var(--color-accent)" },
  transcript: { bg: "var(--color-info-soft)", color: "var(--color-info)" },
  pdf: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  recording: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
};
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  ready: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  processing: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  pending: { bg: "var(--color-bg-elevated)", color: "var(--color-muted)" },
  error: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
};

export default async function SourcesPage() {
  const sources = await listSources();

  return (
    <div className={page.wrapper}>
      <div className={page.headerRow}>
        <div className={`${page.header} animate-fade-in`}>
          <h1 className="text-2xl md:text-3xl font-semibold" style={styles.title}>
            Quellen
          </h1>
          <p className="text-sm" style={styles.muted}>
            {sources.length} {sources.length === 1 ? "Quelle" : "Quellen"} gespeichert
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sources/import" className={btn.secondary} style={{ background: "var(--color-bg-elevated)", color: "var(--color-text)" }}>
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
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl" style={styles.accentSoft}>
            +
          </div>
          <p className="text-base font-medium" style={{ color: "var(--color-text)" }}>
            Noch keine Quellen vorhanden
          </p>
          <p className="text-sm max-w-xs" style={styles.muted}>
            Füge Texte, Transkripte oder PDFs hinzu, um die Wissensbasis aufzubauen.
          </p>
          <Link href="/sources/new" className={btn.primary} style={{ ...styles.accent, marginTop: "0.25rem" }}>
            Erste Quelle hinzufügen
          </Link>
        </div>
      )}

      {sources.length > 0 && (
        <div className="flex flex-col gap-2.5 stagger-children">
          {sources.map((s) => {
            const tStyle = TYPE_STYLE[s.source_type] ?? TYPE_STYLE.text;
            const sStyle = STATUS_STYLE[s.status] ?? STATUS_STYLE.pending;
            return (
              <Link
                key={s.id}
                href={`/sources/${s.id}`}
                className={card.hover}
                style={styles.panel}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                    <span className="text-[15px] font-medium truncate" style={{ color: "var(--color-text)" }}>
                      {s.title}
                    </span>
                    {s.description && (
                      <span className="text-sm line-clamp-2" style={styles.muted}>
                        {s.description}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className={badge.pill} style={{ background: tStyle.bg, color: tStyle.color }}>
                        {TYPE_LABEL[s.source_type] ?? s.source_type}
                      </span>
                      <span className={badge.pill} style={{ background: sStyle.bg, color: sStyle.color }}>
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                      {s.word_count != null && (
                        <span className="text-[11px]" style={styles.muted}>
                          {s.word_count.toLocaleString("de-DE")} Wörter
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] shrink-0 mt-0.5" style={styles.muted}>
                    {new Date(s.created_at).toLocaleDateString("de-DE", {
                      day: "2-digit", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
