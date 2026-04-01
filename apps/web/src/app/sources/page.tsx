import { EntityTable } from "@/components/entity-table";
import { LiveFiltersBar } from "@/components/live-filters-bar";
import { PageHeader } from "@/components/page-header";
import { listSources } from "@/lib/db/repository";
import { matchesSearch, matchesStatus } from "@/lib/search/filters";

type Props = {
  searchParams?: Promise<{ q?: string; status?: string }>;
};

export default async function SourcesPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const query = params.q || "";
  const status = params.status || "all";
  const sources = await listSources();
  const filtered = sources.filter(
    (source) =>
      matchesSearch(`${source.title || ""} ${source.source_name} ${source.source_type}`, query) &&
      matchesStatus(source.status, status)
  );

  return (
    <div className="stack">
      <PageHeader
        title="Quellen"
        description="Externe und interne Datenquellen."
        actionHref="/sources/new"
        actionLabel="Neue Quelle"
      />
      <LiveFiltersBar statuses={["ready", "draft", "archived"]} />
      <EntityTable
        items={filtered}
        getRowHref={(item) => `/sources/${item.id}`}
        columns={[
          { key: "title", label: "Titel", render: (item) => <strong>{item.title || item.source_name}</strong> },
          { key: "source_type", label: "Typ", render: (item) => item.source_type },
          { key: "mime_type", label: "MIME", render: (item) => item.mime_type || "—" },
          { key: "status", label: "Status", render: (item) => <span className="badge status">{item.status}</span> }
        ]}
      />
    </div>
  );
}
