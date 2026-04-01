import { notFound } from "next/navigation";

import { DetailCard } from "@/components/detail-card";
import { LinkedRecords } from "@/components/linked-records";
import { PageHeader } from "@/components/page-header";
import { getCompanyById, listContacts, listInteractions, listProjects, listTasks } from "@/lib/db/repository";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompanyById(id);

  if (!company) {
    notFound();
  }

  const [contacts, projects, tasks, interactions] = await Promise.all([
    listContacts(),
    listProjects(),
    listTasks(),
    listInteractions()
  ]);

  return (
    <div className="stack">
      <PageHeader title={company.name} description={company.summary || "Noch keine Zusammenfassung."} actionHref="/companies" actionLabel="Zurück zur Liste" secondaryActions={[{ href: `/companies/${id}/edit`, label: "Bearbeiten" }]} />
      <div className="detail-grid">
        <DetailCard title="Overview">
          <dl className="key-value">
            <dt>Status</dt>
            <dd><span className="badge status">{company.status}</span></dd>
            <dt>Rechtlicher Name</dt>
            <dd>{company.legal_name || "—"}</dd>
            <dt>Website</dt>
            <dd>
              {company.website ? (
                <a href={company.website} target="_blank" rel="noreferrer">
                  {company.website}
                </a>
              ) : (
                "—"
              )}
            </dd>
            <dt>Notizen</dt>
            <dd>{company.notes_preview || "Noch keine Notizen."}</dd>
          </dl>
        </DetailCard>

        <LinkedRecords
          title="Verknüpfte Datensätze"
          items={[
            ...contacts.filter((item) => item.company_id === company.id).map((item) => ({
              id: item.id,
              label: `${item.first_name} ${item.last_name}`,
              description: item.role_title,
              href: `/contacts/${item.id}`
            })),
            ...projects.filter((item) => item.company_id === company.id).map((item) => ({
              id: item.id,
              label: item.name,
              description: item.project_type,
              href: `/projects/${item.id}`
            })),
            ...tasks.filter((item) => item.company_id === company.id).map((item) => ({
              id: item.id,
              label: item.title,
              description: item.status,
              href: `/tasks/${item.id}`
            })),
            ...interactions.filter((item) => item.company_id === company.id).map((item) => ({
              id: item.id,
              label: item.summary,
              description: item.interaction_type,
              href: `/interactions/${item.id}`
            }))
          ]}
        />
      </div>
    </div>
  );
}
