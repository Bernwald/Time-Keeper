import { notFound } from "next/navigation";

import { updateContactAction, deleteContactAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getContactFields } from "@/lib/config/entity-fields";
import { getContactById } from "@/lib/db/repository";

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const contact = await getContactById(id);
  if (!contact) notFound();

  return (
    <div className="stack">
      <PageHeader title="Kontakt bearbeiten" description={`${contact.first_name} ${contact.last_name}`} />
      <EntityForm
        title="Kontaktdaten"
        description="Kontaktdaten aktualisieren."
        submitLabel="Speichern"
        cancelHref={`/contacts/${id}`}
        action={updateContactAction}
        mode="edit"
        entityId={id}
        deleteAction={deleteContactAction}
        fields={getContactFields({
          first_name: contact.first_name,
          last_name: contact.last_name,
          email: contact.email,
          phone: contact.phone,
          role_title: contact.role_title,
          status: contact.status,
          notes: contact.notes,
        })}
      />
    </div>
  );
}
