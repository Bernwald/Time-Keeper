import Link from "next/link";
import { notFound } from "next/navigation";
import { getSourceById } from "@/lib/db/queries/sources";
import { listChunksBySource } from "@/lib/db/queries/chunks";
import { deleteSource } from "@/app/actions";
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
    <span className={badge.base} style={{ background: c.bg, color: c.text }}>
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
    <span className={badge.base} style={{ background: c.bg, color: c.text }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [source, chunks] = await Promise.all([
    getSourceById(id),
    listChunksBySource(id),
  ]);

  if (!source) notFound();

  const deleteAction = deleteSource.bind(null, id);

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8 max-w-4xl">
      {/* Back link */}
      <Link
        href="/sources"
        className="text-sm flex items-center gap-1"
        style={{ color: "var(--color-muted)" }}
      >
        ← Alle Quellen
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1
            className="text-2xl font-semibold leading-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            {source.title}
          </h1>
          {source.description && (
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>
              {source.description}
            </p>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={source.source_type} />
            <StatusBadge status={source.status} />
            {source.word_count != null && (
              <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                {source.word_count.toLocaleString("de-DE")} Wörter
              </span>
            )}
            <span className="text-xs" style={{ color: "var(--color-muted)" }}>
              {new Date(source.created_at).toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </div>

        {/* Delete */}
        <form action={deleteAction}>
          <button
            type="submit"
            className={btn.danger}
            style={{
              background: "var(--color-danger-soft)",
              color: "var(--color-danger)",
            }}
          >
            Löschen
          </button>
        </form>
      </div>

      {/* PDF info */}
      {source.source_type === "pdf" && source.original_filename && (
        <div
          className={`${card.base} flex items-center gap-3`}
          style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
        >
          <span className="text-2xl">📄</span>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              {source.original_filename}
            </p>
            <p className="text-xs" style={{ color: "var(--color-muted)" }}>
              Originalversion
            </p>
          </div>
        </div>
      )}

      {/* Chunks section */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
            Chunks
          </h2>
          <span className="text-sm" style={{ color: "var(--color-muted)" }}>
            {chunks.length} {chunks.length === 1 ? "Abschnitt" : "Abschnitte"}
          </span>
        </div>

        {chunks.length === 0 && (
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Noch keine Chunks vorhanden. Status: {STATUS_LABEL[source.status] ?? source.status}
          </p>
        )}

        {chunks.map((chunk) => (
          <div
            key={chunk.id}
            className={card.base}
            style={{
              background: "var(--color-panel)",
              border: "1px solid var(--color-line)",
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span
                className={`${badge.base}`}
                style={{
                  background: "var(--color-accent-soft)",
                  color: "var(--color-accent)",
                }}
              >
                #{chunk.chunk_index + 1}
              </span>
              {chunk.token_count != null && (
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  ~{chunk.token_count} Tokens
                </span>
              )}
            </div>
            <p
              className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-6"
              style={{ color: "var(--color-text)" }}
            >
              {chunk.chunk_text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
