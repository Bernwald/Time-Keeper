"use client";

import { useState, useTransition } from "react";
import type { Tag, EntityTag } from "@/lib/db/queries/tags";
import { TagChip } from "./tag-chips";
import { addEntityTag, removeEntityTag } from "@/app/actions";

export function TagManager({
  entityType,
  entityId,
  currentTags,
  allTags,
}: {
  entityType: string;
  entityId: string;
  currentTags: EntityTag[];
  allTags: Tag[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [tags, setTags] = useState<EntityTag[]>(currentTags);

  const availableTags = allTags.filter(
    (t) => !tags.some((ct) => ct.id === t.id),
  );

  function handleAdd(tag: Tag) {
    setTags((prev) => [...prev, { id: tag.id, name: tag.name, color: tag.color, category: tag.category }]);
    startTransition(async () => {
      await addEntityTag(tag.id, entityType, entityId);
    });
  }

  function handleRemove(tagId: string) {
    setTags((prev) => prev.filter((t) => t.id !== tagId));
    startTransition(async () => {
      await removeEntityTag(tagId, entityType, entityId);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((tag) => (
          <TagChip key={tag.id} tag={tag} onRemove={() => handleRemove(tag.id)} />
        ))}
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs transition-all"
          style={{
            background: "var(--color-bg-elevated)",
            color: "var(--color-muted)",
            border: "1px dashed var(--color-line)",
          }}
          disabled={isPending}
          aria-label="Tag hinzufuegen"
        >
          +
        </button>
      </div>
      {open && availableTags.length > 0 && (
        <div
          className="flex flex-wrap gap-1.5 p-2 rounded-lg"
          style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-line)" }}
        >
          {availableTags.map((tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => handleAdd(tag)}
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium leading-tight transition-all hover:opacity-80 min-h-[28px]"
              style={{
                background: `${tag.color || "var(--color-accent)"}18`,
                color: tag.color || "var(--color-accent)",
              }}
              disabled={isPending}
            >
              + {tag.name}
            </button>
          ))}
        </div>
      )}
      {open && availableTags.length === 0 && (
        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
          Keine weiteren Tags verfuegbar.
        </p>
      )}
    </div>
  );
}
