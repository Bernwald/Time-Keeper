import { EntityTable } from "@/components/entity-table";
import { LiveFiltersBar } from "@/components/live-filters-bar";
import { PageHeader } from "@/components/page-header";
import { listContentItems } from "@/lib/db/repository";
import { matchesSearch, matchesStatus } from "@/lib/search/filters";

type Props = {
  searchParams?: Promise<{ q?: string; status?: string }>;
};

export default async function ContentPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const query = params.q || "";
  const status = params.status || "all";
  const items = await listContentItems();
  const filtered = items.filter(
    (item) =>
      matchesSearch(`${item.title} ${item.summary || ""} ${item.cleaned_text || ""}`, query) &&
      matchesStatus(item.status, status)
  );

  return (
    <div className="stack">
      <PageHeader
        title="Inhalte"
        description="Wissensinhalte, Zusammenfassungen und Notizen."
        actionHref="/content/new"
        actionLabel="Neuer Inhalt"
      />
      <LiveFiltersBar statuses={["draft", "active", "archived"]} />
      <EntityTable
        items={filtered}
        getRowHref={(item) => `/content/${item.id}`}
        columns={[
          { key: "title", label: "Titel", render: (item) => <strong>{item.title}</strong> },
          { key: "content_type", label: "Typ", render: (item) => item.content_type },
          { key: "source", label: "Quelle", render: (item) => item.source_title || "—" },
          { key: "status", label: "Status", render: (item) => <span className="badge status">{item.status}</span> }
        ]}
      />
    </div>
  );
}
