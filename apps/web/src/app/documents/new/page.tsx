import { createDocumentAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getDocumentFields } from "@/lib/config/entity-fields";

export default function NewDocumentPage() {
  return (
    <div className="stack">
      <PageHeader title="Neues Dokument" description="Ein neues Dokument erstellen." />
      <EntityForm
        title="Dokumentdaten"
        description="Dokumente, Berichte und Spezifikationen in einem Modell."
        submitLabel="Dokument erstellen"
        cancelHref="/documents"
        action={createDocumentAction}
        fields={getDocumentFields()}
      />
    </div>
  );
}
