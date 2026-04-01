import { EntityTable } from "@/components/entity-table";
import { LiveFiltersBar } from "@/components/live-filters-bar";
import { PageHeader } from "@/components/page-header";
import { statusOptions } from "@/lib/config/modules";
import { listInteractions } from "@/lib/db/repository";
import { matchesSearch, matchesStatus } from "@/lib/search/filters";

type Props = {
  searchParams?: Promise<{ q?: string; status?: string }>;
};

export default async function InteractionsPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const query = params.q || "";
  const status = params.status || "all";
  const interactions = await listInteractions();
  const filtered = interactions.filter(
    (interaction) =>
      matchesSearch(
        `${interaction.summary} ${interaction.company_name || ""} ${interaction.contact_name || ""}`,
        query
      ) && matchesStatus(interaction.interaction_type, status)
  );

  return (
    <div className="stack">
      <PageHeader
        title="Interaktionen"
        description="Meetings, Anrufe, E-Mails und Notizen."
        actionHref="/interactions/new"
        actionLabel="Neue Interaktion"
      />
      <LiveFiltersBar statuses={[...statusOptions.interactions]} />
      <EntityTable
        items={filtered}
        getRowHref={(item) => `/interactions/${item.id}`}
        columns={[
          { key: "summary", label: "Zusammenfassung", render: (item) => <strong>{item.summary}</strong> },
          { key: "type", label: "Typ", render: (item) => <span className="badge status">{item.interaction_type}</span> },
          { key: "company", label: "Unternehmen", render: (item) => item.company_name || "—" },
          { key: "occurred_at", label: "Wann", render: (item) => new Date(item.occurred_at).toLocaleString() }
        ]}
      />
    </div>
  );
}
