import { notFound } from "next/navigation";

import { updateProjectAction, deleteProjectAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getProjectFields } from "@/lib/config/entity-fields";
import { getProjectById } from "@/lib/db/repository";

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) notFound();

  return (
    <div className="stack">
      <PageHeader title="Projekt bearbeiten" description={project.name} />
      <EntityForm
        title="Projektdaten"
        description="Projektdaten aktualisieren."
        submitLabel="Speichern"
        cancelHref={`/projects/${id}`}
        action={updateProjectAction}
        mode="edit"
        entityId={id}
        deleteAction={deleteProjectAction}
        fields={getProjectFields({
          name: project.name,
          project_type: project.project_type,
          status: project.status,
          summary: project.summary,
        })}
      />
    </div>
  );
}
