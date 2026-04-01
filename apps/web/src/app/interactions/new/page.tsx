import { createInteractionAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getInteractionFields } from "@/lib/config/entity-fields";

export default function NewInteractionPage() {
  return (
    <div className="stack">
      <PageHeader title="Neue Interaktion" description="Ein Meeting, einen Anruf oder eine Notiz dokumentieren." />
      <EntityForm
        title="Interaktionsdaten"
        description="Interaktionen verknüpfen Personen, Unternehmen und Projekte."
        submitLabel="Interaktion erstellen"
        cancelHref="/interactions"
        action={createInteractionAction}
        fields={getInteractionFields()}
      />
    </div>
  );
}
