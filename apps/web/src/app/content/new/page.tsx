import { createContentItemAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getContentItemFields } from "@/lib/config/entity-fields";

export default function NewContentPage() {
  return (
    <div className="stack">
      <PageHeader title="Neuer Inhalt" description="Einen neuen Wissensinhalt erstellen." />
      <EntityForm
        title="Inhaltsdaten"
        description="Wissensinhalte, Zusammenfassungen und Notizen."
        submitLabel="Inhalt erstellen"
        cancelHref="/content"
        action={createContentItemAction}
        fields={getContentItemFields()}
      />
    </div>
  );
}
