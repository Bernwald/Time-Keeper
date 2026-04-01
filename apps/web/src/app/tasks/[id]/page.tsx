import { notFound } from "next/navigation";

import { DetailCard } from "@/components/detail-card";
import { PageHeader } from "@/components/page-header";
import { getTaskById } from "@/lib/db/repository";

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getTaskById(id);

  if (!task) {
    notFound();
  }

  return (
    <div className="stack">
      <PageHeader title={task.title} description={task.description || "Aufgabendetail"} actionHref="/tasks" actionLabel="Zurück zur Liste" secondaryActions={[{ href: `/tasks/${id}/edit`, label: "Bearbeiten" }]} />
      <DetailCard title="Overview">
        <dl className="key-value">
          <dt>Status</dt>
          <dd><span className="badge status">{task.status}</span></dd>
          <dt>Priorität</dt>
          <dd>{task.priority || "—"}</dd>
          <dt>Fällig am</dt>
          <dd>{task.due_date || "—"}</dd>
          <dt>Unternehmen</dt>
          <dd>{task.company_name || "—"}</dd>
          <dt>Kontakt</dt>
          <dd>{task.contact_name || "—"}</dd>
          <dt>Projekt</dt>
          <dd>{task.project_name || "—"}</dd>
        </dl>
      </DetailCard>
    </div>
  );
}
