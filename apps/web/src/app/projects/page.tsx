import { EntityTable } from "@/components/entity-table";
import { LiveFiltersBar } from "@/components/live-filters-bar";
import { PageHeader } from "@/components/page-header";
import { statusOptions } from "@/lib/config/modules";
import { listProjects } from "@/lib/db/repository";
import { matchesSearch, matchesStatus } from "@/lib/search/filters";

type Props = {
  searchParams?: Promise<{ q?: string; status?: string }>;
};

export default async function ProjectsPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const query = params.q || "";
  const status = params.status || "all";
  const projects = await listProjects();
  const filtered = projects.filter(
    (project) =>
      matchesSearch(`${project.name} ${project.summary || ""} ${project.company_name || ""}`, query) &&
      matchesStatus(project.status, status)
  );

  return (
    <div className="stack">
      <PageHeader
        title="Projekte"
        description="Projekte, Opportunities und Initiativen verwalten."
        actionHref="/projects/new"
        actionLabel="Neues Projekt"
      />
      <LiveFiltersBar statuses={[...statusOptions.projects]} />
      <EntityTable
        items={filtered}
        getRowHref={(item) => `/projects/${item.id}`}
        columns={[
          { key: "name", label: "Name", render: (item) => <strong>{item.name}</strong> },
          { key: "type", label: "Typ", render: (item) => item.project_type },
          { key: "company", label: "Unternehmen", render: (item) => item.company_name || "—" },
          { key: "status", label: "Status", render: (item) => <span className="badge status">{item.status}</span> }
        ]}
      />
    </div>
  );
}
