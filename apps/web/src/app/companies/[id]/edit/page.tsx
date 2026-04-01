import { notFound } from "next/navigation";

import { updateCompanyAction, deleteCompanyAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getCompanyFields } from "@/lib/config/entity-fields";
import { getCompanyById } from "@/lib/db/repository";

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompanyById(id);
  if (!company) notFound();

  return (
    <div className="stack">
      <PageHeader title="Unternehmen bearbeiten" description={company.name} />
      <EntityForm
        title="Unternehmensdaten"
        description="Unternehmensdaten aktualisieren."
        submitLabel="Speichern"
        cancelHref={`/companies/${id}`}
        action={updateCompanyAction}
        mode="edit"
        entityId={id}
        deleteAction={deleteCompanyAction}
        fields={getCompanyFields({
          name: company.name,
          legal_name: company.legal_name,
          website: company.website,
          status: company.status,
          summary: company.summary,
          notes_preview: company.notes_preview,
        })}
      />
    </div>
  );
}
