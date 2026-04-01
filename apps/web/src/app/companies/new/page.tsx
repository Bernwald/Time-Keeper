import { createCompanyAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getCompanyFields } from "@/lib/config/entity-fields";

export default function NewCompanyPage() {
  return (
    <div className="stack">
      <PageHeader title="Neues Unternehmen" description="Ein neues Unternehmen zum Workspace hinzufügen." />
      <EntityForm
        title="Unternehmensdaten"
        description="Das Unternehmensmodell ist bewusst schlank und standardisierbar."
        submitLabel="Unternehmen erstellen"
        cancelHref="/companies"
        action={createCompanyAction}
        fields={getCompanyFields()}
      />
    </div>
  );
}
