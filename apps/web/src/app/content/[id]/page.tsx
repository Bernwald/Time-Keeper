import { notFound } from "next/navigation";

import { DetailCard } from "@/components/detail-card";
import { LinkedRecords } from "@/components/linked-records";
import { PageHeader } from "@/components/page-header";
import { getContentItemById, listCompanies, listContentLinks, listContacts, listInteractions, listProjects, listTasks } from "@/lib/db/repository";

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getContentItemById(id);

  if (!item) {
    notFound();
  }

  const [links, companies, contacts, projects, interactions, tasks] = await Promise.all([
    listContentLinks(),
    listCompanies(),
    listContacts(),
    listProjects(),
    listInteractions(),
    listTasks()
  ]);

  const linkedRecords = links
    .filter((link) => link.content_item_id === item.id)
    .map((link) => {
      if (link.linked_object_type === "company") {
        const company = companies.find((record) => record.id === link.linked_object_id);
        return company ? { id: link.id, label: company.name, description: link.link_role, href: `/companies/${company.id}` } : null;
      }
      if (link.linked_object_type === "contact") {
        const contact = contacts.find((record) => record.id === link.linked_object_id);
        return contact ? { id: link.id, label: `${contact.first_name} ${contact.last_name}`, description: link.link_role, href: `/contacts/${contact.id}` } : null;
      }
      if (link.linked_object_type === "project") {
        const project = projects.find((record) => record.id === link.linked_object_id);
        return project ? { id: link.id, label: project.name, description: link.link_role, href: `/projects/${project.id}` } : null;
      }
      if (link.linked_object_type === "interaction") {
        const interaction = interactions.find((record) => record.id === link.linked_object_id);
        return interaction ? { id: link.id, label: interaction.summary, description: link.link_role, href: `/interactions/${interaction.id}` } : null;
      }
      if (link.linked_object_type === "task") {
        const task = tasks.find((record) => record.id === link.linked_object_id);
        return task ? { id: link.id, label: task.title, description: link.link_role, href: `/tasks/${task.id}` } : null;
      }

      return null;
    })
    .filter(Boolean) as Array<{ id: string; label: string; description?: string | null; href: string }>;

  return (
    <div className="stack">
      <PageHeader title={item.title} description={item.content_type} actionHref="/content" actionLabel="Zurück zur Liste" secondaryActions={[{ href: `/content/${id}/edit`, label: "Bearbeiten" }]} />
      <div className="detail-grid">
        <DetailCard title="Overview">
          <dl className="key-value">
            <dt>Typ</dt>
            <dd>{item.content_type}</dd>
            <dt>Status</dt>
            <dd><span className="badge status">{item.status}</span></dd>
            <dt>Quelle</dt>
            <dd>{item.source_title || "—"}</dd>
            <dt>Sprache</dt>
            <dd>{item.language || "—"}</dd>
            <dt>Zusammenfassung</dt>
            <dd>{item.summary || "Noch keine Zusammenfassung."}</dd>
            <dt>Text</dt>
            <dd>{item.cleaned_text || item.raw_text || "Noch kein Text."}</dd>
          </dl>
        </DetailCard>
        <LinkedRecords title="Operative Verknüpfungen" items={linkedRecords} />
      </div>
    </div>
  );
}
