import { createSourceAction, createUploadedSourceAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { FileUploadZone } from "@/components/file-upload-zone";
import { PageHeader } from "@/components/page-header";
import { getSourceFields } from "@/lib/config/entity-fields";

export default function NewSourcePage() {
  return (
    <div className="stack">
      <PageHeader title="Neue Quelle" description="Eine neue Datenquelle hinzufügen." />
      <FileUploadZone action={createUploadedSourceAction} />
      <EntityForm
        title="Quellendaten"
        description="Manuelle Quelle erfassen."
        submitLabel="Quelle erstellen"
        cancelHref="/sources"
        action={createSourceAction}
        fields={getSourceFields()}
      />
    </div>
  );
}
