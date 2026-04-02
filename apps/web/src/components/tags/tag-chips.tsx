"use client";

import type { EntityTag } from "@/lib/db/queries/tags";

const DEFAULT_COLOR = "var(--color-accent)";

export function TagChip({ tag, onRemove }: { tag: EntityTag; onRemove?: () => void }) {
  const color = tag.color || DEFAULT_COLOR;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium leading-tight"
      style={{ background: `${color}18`, color }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 hover:opacity-70 min-w-[16px] min-h-[16px] flex items-center justify-center"
          aria-label={`Tag ${tag.name} entfernen`}
        >
          ×
        </button>
      )}
    </span>
  );
}

export function TagList({ tags }: { tags: EntityTag[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}
    </div>
  );
}
