import { EntityTable } from "@/components/entity-table";
import { LiveFiltersBar } from "@/components/live-filters-bar";
import { PageHeader } from "@/components/page-header";
import { statusOptions } from "@/lib/config/modules";
import { listDocuments } from "@/lib/db/repository";
import { matchesSearch, matchesStatus } from "@/lib/search/filters";

type Props = {
  searchParams?: Promise<{ q?: string; status?: string }>;
};

export default async function DocumentsPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const query = params.q || "";
  const status = params.status || "all";
  const documents = await listDocuments();
  const filtered = documents.filter(
    (document) =>
      matchesSearch(`${document.title} ${document.content_text || ""} ${document.document_type}`, query) &&
      matchesStatus(document.status, status)
  );

  return (
    <div className="stack">
      <PageHeader
        title="Dokumente"
        description="Dokumente, Berichte und Spezifikationen."
        actionHref="/documents/new"
        actionLabel="Neues Dokument"
      />
      <LiveFiltersBar statuses={[...statusOptions.documents]} />
      <EntityTable
        items={filtered}
        getRowHref={(item) => `/documents/${item.id}`}
        columns={[
          { key: "title", label: "Titel", render: (item) => <strong>{item.title}</strong> },
          { key: "type", label: "Typ", render: (item) => item.document_type },
          { key: "status", label: "Status", render: (item) => <span className="badge status">{item.status}</span> },
          { key: "origin", label: "Herkunft", render: (item) => item.origin_type }
        ]}
      />
    </div>
  );
}
