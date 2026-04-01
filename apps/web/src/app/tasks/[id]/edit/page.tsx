import { notFound } from "next/navigation";

import { updateTaskAction, deleteTaskAction } from "@/app/actions";
import { EntityForm } from "@/components/entity-form";
import { PageHeader } from "@/components/page-header";
import { getTaskFields } from "@/lib/config/entity-fields";
import { getTaskById } from "@/lib/db/repository";

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await getTaskById(id);
  if (!task) notFound();

  return (
    <div className="stack">
      <PageHeader title="Aufgabe bearbeiten" description={task.title} />
      <EntityForm
        title="Aufgabendaten"
        description="Aufgabendaten aktualisieren."
        submitLabel="Speichern"
        cancelHref={`/tasks/${id}`}
        action={updateTaskAction}
        mode="edit"
        entityId={id}
        deleteAction={deleteTaskAction}
        fields={getTaskFields({
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          due_date: task.due_date,
        })}
      />
    </div>
  );
}
