import { notFound } from "next/navigation";

import { updateSourceAction, deleteSourceAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getSourceFields } from "@/lib/config/entity-fields";
import { getSourceById } from "@/lib/db/repository";

export default async function EditSourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = await getSourceById(id);
  if (!source) notFound();

  return (
    <div className="stack">
      <PageHeader title="Quelle bearbeiten" description={source.title || source.source_name} />
      <EntityForm
        title="Quellendaten"
        description="Quellendaten aktualisieren."
        submitLabel="Speichern"
        cancelHref={`/sources/${id}`}
        action={updateSourceAction}
        mode="edit"
        entityId={id}
        deleteAction={deleteSourceAction}
        fields={getSourceFields({
          source_name: source.source_name,
          title: source.title,
          source_type: source.source_type,
          source_origin: source.source_origin,
          mime_type: source.mime_type,
          external_url: source.external_url,
          status: source.status,
        })}
      />
    </div>
  );
}
