import { EntityTable } from "@/components/entity-table";
import { LiveFiltersBar } from "@/components/live-filters-bar";
import { PageHeader } from "@/components/page-header";
import { statusOptions } from "@/lib/config/modules";
import { listTasks } from "@/lib/db/repository";
import { matchesSearch, matchesStatus } from "@/lib/search/filters";

type Props = {
  searchParams?: Promise<{ q?: string; status?: string }>;
};

export default async function TasksPage({ searchParams }: Props) {
  const params = (await searchParams) || {};
  const query = params.q || "";
  const status = params.status || "all";
  const tasks = await listTasks();
  const filtered = tasks.filter(
    (task) =>
      matchesSearch(`${task.title} ${task.description || ""} ${task.company_name || ""}`, query) &&
      matchesStatus(task.status, status)
  );

  return (
    <div className="stack">
      <PageHeader
        title="Aufgaben"
        description="Operative Aufgaben über alle Projekte und Kontakte."
        actionHref="/tasks/new"
        actionLabel="Neue Aufgabe"
      />
      <LiveFiltersBar statuses={[...statusOptions.tasks]} />
      <EntityTable
        items={filtered}
        getRowHref={(item) => `/tasks/${item.id}`}
        columns={[
          { key: "title", label: "Titel", render: (item) => <strong>{item.title}</strong> },
          { key: "status", label: "Status", render: (item) => <span className="badge status">{item.status}</span> },
          { key: "priority", label: "Priorität", render: (item) => item.priority || "—" },
          { key: "due_date", label: "Fällig", render: (item) => item.due_date || "—" }
        ]}
      />
    </div>
  );
}
