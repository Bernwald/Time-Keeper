import { EntityTable } from "@/components/entity-table";
import { LiveFiltersBar } from "@/components/live-filters-bar";
import { PageHeader } from "@/components/page-header";
import { statusOptions } from "@/lib/config/modules";
import { listCompanies } from "@/lib/db/repository";
import { matchesSearch, matchesStatus } from "@/lib/search/filters";

type Props = {
  searchParams?: Promise<{ q?: string; status?: string }>;
};

export default async function CompaniesPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const query = params.q || "";
  const status = params.status || "all";
  const companies = await listCompanies();
  const filtered = companies.filter(
    (company) =>
      matchesSearch(`${company.name} ${company.summary || ""}`, query) && matchesStatus(company.status, status)
  );

  return (
    <div className="stack">
      <PageHeader
        title="Unternehmen"
        description="Organisationen, ihren aktuellen Status und den operativen Kontext verfolgen."
        actionHref="/companies/new"
        actionLabel="Neues Unternehmen"
      />
      <LiveFiltersBar statuses={[...statusOptions.companies]} />
      <EntityTable
        items={filtered}
        getRowHref={(item) => `/companies/${item.id}`}
        columns={[
          { key: "name", label: "Name", render: (item) => <strong>{item.name}</strong> },
          { key: "status", label: "Status", render: (item) => <span className="badge status">{item.status}</span> },
          { key: "website", label: "Website", render: (item) => item.website || "—" },
          { key: "summary", label: "Zusammenfassung", render: (item) => item.summary || "—" }
        ]}
      />
    </div>
  );
}
