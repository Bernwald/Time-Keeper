import { notFound } from "next/navigation";

import { updateDocumentAction, deleteDocumentAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getDocumentFields } from "@/lib/config/entity-fields";
import { getDocumentById } from "@/lib/db/repository";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await getDocumentById(id);
  if (!document) notFound();

  return (
    <div className="stack">
      <PageHeader title="Dokument bearbeiten" description={document.title} />
      <EntityForm
        title="Dokumentdaten"
        description="Dokumentdaten aktualisieren."
        submitLabel="Speichern"
        cancelHref={`/documents/${id}`}
        action={updateDocumentAction}
        mode="edit"
        entityId={id}
        deleteAction={deleteDocumentAction}
        fields={getDocumentFields({
          title: document.title,
          document_type: document.document_type,
          status: document.status,
          origin_type: document.origin_type,
          content_markdown: document.content_markdown,
        })}
      />
    </div>
  );
}
