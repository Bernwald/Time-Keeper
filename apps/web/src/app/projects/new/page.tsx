import { createProjectAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getProjectFields } from "@/lib/config/entity-fields";

export default function NewProjectPage() {
  return (
    <div className="stack">
      <PageHeader title="Neues Projekt" description="Ein neues Projekt zum Workspace hinzufügen." />
      <EntityForm
        title="Projektdaten"
        description="Projekte, Opportunities und Initiativen in einem schlanken Modell."
        submitLabel="Projekt erstellen"
        cancelHref="/projects"
        action={createProjectAction}
        fields={getProjectFields()}
      />
    </div>
  );
}
