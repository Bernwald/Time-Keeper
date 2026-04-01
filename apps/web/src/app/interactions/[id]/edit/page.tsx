import { notFound } from "next/navigation";

import { updateInteractionAction, deleteInteractionAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getInteractionFields } from "@/lib/config/entity-fields";
import { getInteractionById } from "@/lib/db/repository";

export default async function EditInteractionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const interaction = await getInteractionById(id);
  if (!interaction) notFound();

  const occurredDate = interaction.occurred_at ? new Date(interaction.occurred_at).toISOString().split("T")[0] : undefined;

  return (
    <div className="stack">
      <PageHeader title="Interaktion bearbeiten" description={interaction.summary} />
      <EntityForm
        title="Interaktionsdaten"
        description="Interaktionsdaten aktualisieren."
        submitLabel="Speichern"
        cancelHref={`/interactions/${id}`}
        action={updateInteractionAction}
        mode="edit"
        entityId={id}
        deleteAction={deleteInteractionAction}
        fields={getInteractionFields({
          interaction_type: interaction.interaction_type,
          occurred_at: occurredDate,
          summary: interaction.summary,
          next_steps: interaction.next_steps,
        })}
      />
    </div>
  );
}
