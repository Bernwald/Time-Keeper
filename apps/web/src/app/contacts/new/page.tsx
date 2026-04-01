import { createContactAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getContactFields } from "@/lib/config/entity-fields";

export default function NewContactPage() {
  return (
    <div className="stack">
      <PageHeader title="Neuer Kontakt" description="Eine Person hinzufügen und mit dem richtigen Unternehmenskontext verknüpfen." />
      <EntityForm
        title="Kontaktdaten"
        description="Kontakte bleiben schlank und verknüpfen zurück zu Unternehmen, Interaktionen und Aufgaben."
        submitLabel="Kontakt erstellen"
        cancelHref="/contacts"
        action={createContactAction}
        fields={getContactFields()}
      />
    </div>
  );
}
