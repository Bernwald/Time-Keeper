import { createTaskAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getTaskFields } from "@/lib/config/entity-fields";

export default function NewTaskPage() {
  return (
    <div className="stack">
      <PageHeader title="Neue Aufgabe" description="Eine neue operative Aufgabe erstellen." />
      <EntityForm
        title="Aufgabendaten"
        description="Aufgaben tracken operative Punkte über Projekte und Kontakte."
        submitLabel="Aufgabe erstellen"
        cancelHref="/tasks"
        action={createTaskAction}
        fields={getTaskFields()}
      />
    </div>
  );
}
