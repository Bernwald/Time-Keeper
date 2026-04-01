import { notFound } from "next/navigation";

import { DetailCard } from "@/components/detail-card";
import { LinkedRecords } from "@/components/linked-records";
import { PageHeader } from "@/components/page-header";
import { getProjectById, listDocuments, listInteractions, listTasks } from "@/lib/db/repository";

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    notFound();
  }

  const [tasks, interactions, documents] = await Promise.all([listTasks(), listInteractions(), listDocuments()]);

  return (
    <div className="stack">
      <PageHeader title={project.name} description={project.summary || "Projektdatensatz"} actionHref="/projects" actionLabel="Zurück zur Liste" secondaryActions={[{ href: `/projects/${id}/edit`, label: "Bearbeiten" }]} />
      <div className="detail-grid">
        <DetailCard title="Overview">
          <dl className="key-value">
            <dt>Typ</dt>
            <dd>{project.project_type}</dd>
            <dt>Status</dt>
            <dd><span className="badge status">{project.status}</span></dd>
            <dt>Unternehmen</dt>
            <dd>{project.company_name || "—"}</dd>
            <dt>Zusammenfassung</dt>
            <dd>{project.summary || "Noch keine Zusammenfassung."}</dd>
          </dl>
        </DetailCard>

        <LinkedRecords
          title="Verknüpfte Datensätze"
          items={[
            ...tasks.filter((item) => item.project_id === project.id).map((item) => ({
              id: item.id,
              label: item.title,
              description: item.status,
              href: `/tasks/${item.id}`
            })),
            ...interactions.filter((item) => item.project_id === project.id).map((item) => ({
              id: item.id,
              label: item.summary,
              description: item.interaction_type,
              href: `/interactions/${item.id}`
            })),
            ...documents.filter((item) => (item.content_text || "").toLowerCase().includes(project.name.toLowerCase())).map((item) => ({
              id: item.id,
              label: item.title,
              description: item.document_type,
              href: `/documents/${item.id}`
            }))
          ]}
        />
      </div>
    </div>
  );
}
