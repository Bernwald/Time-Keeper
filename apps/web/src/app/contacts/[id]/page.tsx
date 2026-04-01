import { notFound } from "next/navigation";

import { DetailCard } from "@/components/detail-card";
import { LinkedRecords } from "@/components/linked-records";
import { PageHeader } from "@/components/page-header";
import { getContactById, listInteractions, listTasks } from "@/lib/db/repository";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContactById(id);

  if (!contact) {
    notFound();
  }

  const [interactions, tasks] = await Promise.all([listInteractions(), listTasks()]);

  return (
    <div className="stack">
      <PageHeader
        title={`${contact.first_name} ${contact.last_name}`}
        description={contact.role_title || "Kontaktdatensatz"}
        actionHref="/contacts"
        actionLabel="Zurück zur Liste"
        secondaryActions={[{ href: `/contacts/${id}/edit`, label: "Bearbeiten" }]}
      />
      <div className="detail-grid">
        <DetailCard title="Overview">
          <dl className="key-value">
            <dt>Unternehmen</dt>
            <dd>{contact.company_name || "—"}</dd>
            <dt>Status</dt>
            <dd><span className="badge status">{contact.status}</span></dd>
            <dt>E-Mail</dt>
            <dd>{contact.email || "—"}</dd>
            <dt>Telefon</dt>
            <dd>{contact.phone || "—"}</dd>
            <dt>Notizen</dt>
            <dd>{contact.notes || "Noch keine Notizen."}</dd>
          </dl>
        </DetailCard>

        <LinkedRecords
          title="Verknüpfte Datensätze"
          items={[
            ...interactions.filter((item) => item.contact_id === contact.id).map((item) => ({
              id: item.id,
              label: item.summary,
              description: item.interaction_type,
              href: `/interactions/${item.id}`
            })),
            ...tasks.filter((item) => item.contact_id === contact.id).map((item) => ({
              id: item.id,
              label: item.title,
              description: item.status,
              href: `/tasks/${item.id}`
            }))
          ]}
        />
      </div>
    </div>
  );
}
