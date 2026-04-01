import Link from "next/link";
import { listSources } from "@/lib/db/queries/sources";
import { card, badge, btn } from "@/components/ui/table-classes";

const SOURCE_TYPE_LABEL: Record<string, string> = {
  text: "Text",
  transcript: "Transkript",
  pdf: "PDF",
};

const STATUS_LABEL: Record<string, string> = {
  ready: "Bereit",
  processing: "Verarbeitung",
  pending: "Ausstehend",
  error: "Fehler",
};

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    text: { bg: "var(--color-accent-soft)", text: "var(--color-accent)" },
    transcript: { bg: "#e0eaff", text: "#2d5be3" },
    pdf: { bg: "#fef3c7", text: "#b45309" },
  };
  const c = colors[type] ?? colors.text;
  return (
    <span
      className={badge.base}
      style={{ background: c.bg, color: c.text }}
    >
      {SOURCE_TYPE_LABEL[type] ?? type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    ready: { bg: "var(--color-accent-soft)", text: "var(--color-accent)" },
    processing: { bg: "#fef3c7", text: "#b45309" },
    pending: { bg: "#f3f4f6", text: "#6b7280" },
    error: { bg: "var(--color-danger-soft)", text: "var(--color-danger)" },
  };
  const c = colors[status] ?? colors.pending;
  return (
    <span
      className={badge.base}
      style={{ background: c.bg, color: c.text }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default async function SourcesPage() {
  const sources = await listSources();

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-semibold leading-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            Quellen
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            {sources.length} {sources.length === 1 ? "Quelle" : "Quellen"} gespeichert
          </p>
        </div>
        <Link
          href="/sources/new"
          className={btn.primary}
          style={{ background: "var(--color-accent)", color: "#fff" }}
        >
          + Neue Quelle
        </Link>
      </div>

      {/* Empty state */}
      {sources.length === 0 && (
        <div
          className={`${card.base} flex flex-col items-center justify-center gap-3 py-16 text-center`}
          style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
        >
          <p className="text-base font-medium" style={{ color: "var(--color-text)" }}>
            Noch keine Quellen vorhanden
          </p>
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Füge Texte, Transkripte oder PDFs hinzu, um die Wissensbasis aufzubauen.
          </p>
          <Link
            href="/sources/new"
            className={btn.primary}
            style={{ background: "var(--color-accent)", color: "#fff", marginTop: "0.5rem" }}
          >
            Erste Quelle hinzufügen
          </Link>
        </div>
      )}

      {/* Source list */}
      {sources.length > 0 && (
        <div className="flex flex-col gap-3">
          {sources.map((source) => (
            <Link
              key={source.id}
              href={`/sources/${source.id}`}
              className={`${card.hover} flex items-start justify-between gap-4`}
              style={{
                background: "var(--color-panel)",
                border: "1px solid var(--color-line)",
                boxShadow: "var(--shadow-card)",
                textDecoration: "none",
              }}
            >
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <span
                  className="text-base font-medium truncate"
                  style={{ color: "var(--color-text)" }}
                >
                  {source.title}
                </span>
                {source.description && (
                  <span
                    className="text-sm line-clamp-2"
                    style={{ color: "var(--color-muted)" }}
                  >
                    {source.description}
                  </span>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <TypeBadge type={source.source_type} />
                  <StatusBadge status={source.status} />
                  {source.word_count != null && (
                    <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                      {source.word_count.toLocaleString("de-DE")} Wörter
                    </span>
                  )}
                </div>
              </div>
              <span className="text-xs shrink-0 mt-1" style={{ color: "var(--color-muted)" }}>
                {new Date(source.created_at).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
