import { notFound } from "next/navigation";

import { DetailCard } from "@/components/detail-card";
import { PageHeader } from "@/components/page-header";
import { getInteractionById } from "@/lib/db/repository";

export default async function InteractionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const interaction = await getInteractionById(id);

  if (!interaction) {
    notFound();
  }

  return (
    <div className="stack">
      <PageHeader title={interaction.summary} description="Interaktionsdetail" actionHref="/interactions" actionLabel="Zurück zur Liste" secondaryActions={[{ href: `/interactions/${id}/edit`, label: "Bearbeiten" }]} />
      <DetailCard title="Overview">
        <dl className="key-value">
          <dt>Typ</dt>
          <dd><span className="badge status">{interaction.interaction_type}</span></dd>
          <dt>Zeitpunkt</dt>
          <dd>{new Date(interaction.occurred_at).toLocaleString()}</dd>
          <dt>Unternehmen</dt>
          <dd>{interaction.company_name || "—"}</dd>
          <dt>Kontakt</dt>
          <dd>{interaction.contact_name || "—"}</dd>
          <dt>Projekt</dt>
          <dd>{interaction.project_name || "—"}</dd>
          <dt>Nächste Schritte</dt>
          <dd>{interaction.next_steps || "Keine nächsten Schritte erfasst."}</dd>
        </dl>
      </DetailCard>
    </div>
  );
}
