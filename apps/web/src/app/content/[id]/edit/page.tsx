import { notFound } from "next/navigation";

import { updateContentItemAction, deleteContentItemAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getContentItemFields } from "@/lib/config/entity-fields";
import { getContentItemById } from "@/lib/db/repository";

export default async function EditContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await getContentItemById(id);
  if (!item) notFound();

  return (
    <div className="stack">
      <PageHeader title="Inhalt bearbeiten" description={item.title} />
      <EntityForm
        title="Inhaltsdaten"
        description="Inhaltsdaten aktualisieren."
        submitLabel="Speichern"
        cancelHref={`/content/${id}`}
        action={updateContentItemAction}
        mode="edit"
        entityId={id}
        deleteAction={deleteContentItemAction}
        fields={getContentItemFields({
          title: item.title,
          content_type: item.content_type,
          raw_text: item.raw_text,
          summary: item.summary,
          language: item.language,
          status: item.status,
        })}
      />
    </div>
  );
}
