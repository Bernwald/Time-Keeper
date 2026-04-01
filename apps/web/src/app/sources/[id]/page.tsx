import Link from "next/link";
import { notFound } from "next/navigation";
import { getSourceById } from "@/lib/db/queries/sources";
import { listChunksBySource, countChunksWithoutEmbeddings } from "@/lib/db/queries/chunks";
import { listLinksForSource } from "@/lib/db/queries/source-links";
import { listCompanies } from "@/lib/db/queries/companies";
import { listContacts } from "@/lib/db/queries/contacts";
import { listProjects } from "@/lib/db/queries/projects";

export const dynamic = 'force-dynamic';
import { deleteSource } from "@/app/actions";
import { SourceLinks } from "./source-links";
import { BackfillButton } from "./backfill-button";
import { card, badge, btn, page, styles } from "@/components/ui/table-classes";

const TYPE_LABEL: Record<string, string> = { text: "Text", transcript: "Transkript", pdf: "PDF" };
const STATUS_LABEL: Record<string, string> = { ready: "Bereit", processing: "Verarbeitung", pending: "Ausstehend", error: "Fehler" };

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [source, chunks, missingEmbeddings, links, companies, contacts, projects] = await Promise.all([
    getSourceById(id),
    listChunksBySource(id),
    countChunksWithoutEmbeddings(id),
    listLinksForSource(id),
    listCompanies(),
    listContacts(),
    listProjects(),
  ]);
  if (!source) notFound();

  const companyOptions = companies.map((c) => ({ id: c.id, name: c.name }));
  const contactOptions = contacts.map((c) => ({ id: c.id, name: `${c.first_name} ${c.last_name}` }));
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  const deleteAction = deleteSource.bind(null, id);

  return (
    <div className="flex flex-col gap-5 md:gap-6 p-4 md:p-6 lg:p-8 max-w-4xl">
      <Link href="/sources" className="text-xs font-medium inline-block animate-fade-in" style={{ color: "var(--color-accent)" }}>
        ← Alle Quellen
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 animate-fade-in">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl md:text-2xl font-semibold" style={styles.title}>
            {source.title}
          </h1>
          {source.description && (
            <p className="text-sm" style={styles.muted}>{source.description}</p>
          )}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={badge.pill} style={styles.accentSoft}>
              {TYPE_LABEL[source.source_type] ?? source.source_type}
            </span>
            <span className={badge.pill} style={{
              background: source.status === "ready" ? "var(--color-success-soft)" : "var(--color-warning-soft)",
              color: source.status === "ready" ? "var(--color-success)" : "var(--color-warning)",
            }}>
              {STATUS_LABEL[source.status] ?? source.status}
            </span>
            {source.word_count != null && (
              <span className="text-[11px]" style={styles.muted}>
                {source.word_count.toLocaleString("de-DE")} Wörter
              </span>
            )}
            <span className="text-[11px]" style={styles.muted}>
              {new Date(source.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" })}
            </span>
          </div>
        </div>

        <form action={deleteAction} className="shrink-0">
          <button type="submit" className={btn.danger} style={styles.danger}>
            Löschen
          </button>
        </form>
      </div>

      {/* PDF info */}
      {source.source_type === "pdf" && source.original_filename && (
        <div className={`${card.flat} flex items-center gap-3 animate-fade-in`} style={styles.panel}>
          <div className="w-10 h-10 rounded-[var(--radius-sm)] flex items-center justify-center text-lg" style={styles.warning}>
            PDF
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{source.original_filename}</p>
            <p className="text-xs" style={styles.muted}>Originaldatei</p>
          </div>
        </div>
      )}

      {/* Source Links */}
      <SourceLinks
        sourceId={id}
        links={links}
        companies={companyOptions}
        contacts={contactOptions}
        projects={projectOptions}
      />

      {/* Chunks */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Chunks</h2>
          <div className="flex items-center gap-2">
            {missingEmbeddings > 0 && (
              <span className={badge.pill} style={styles.warning}>
                {missingEmbeddings} ohne Embedding
              </span>
            )}
            <span className="text-xs" style={styles.muted}>
              {chunks.length} {chunks.length === 1 ? "Abschnitt" : "Abschnitte"}
            </span>
          </div>
        </div>

        {missingEmbeddings > 0 && (
          <BackfillButton sourceId={id} />
        )}

        {chunks.length === 0 && (
          <p className="text-sm py-4" style={styles.muted}>
            Noch keine Chunks. Status: {STATUS_LABEL[source.status] ?? source.status}
          </p>
        )}

        <div className="flex flex-col gap-2 stagger-children">
          {chunks.map((chunk) => (
            <div key={chunk.id} className={card.flat} style={styles.panel}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className={badge.pill} style={styles.accentSoft}>
                  #{chunk.chunk_index + 1}
                </span>
                {chunk.token_count != null && (
                  <span className="text-[11px]" style={styles.muted}>~{chunk.token_count} Tokens</span>
                )}
              </div>
              <p className="text-sm leading-relaxed whitespace-pre-wrap line-clamp-6" style={{ color: "var(--color-text)" }}>
                {chunk.chunk_text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
