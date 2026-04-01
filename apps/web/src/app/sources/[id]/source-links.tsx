"use client";

import { useState, useTransition } from "react";
import { addSourceLink, removeSourceLink } from "@/app/actions";
import { card, badge, btn, input, styles } from "@/components/ui/table-classes";

type LinkItem = {
  id: string;
  linked_type: string;
  linked_id: string;
  link_role: string;
  linked_name: string;
};

type EntityOption = { id: string; name: string };

type Props = {
  sourceId: string;
  links: LinkItem[];
  companies: EntityOption[];
  contacts: EntityOption[];
  projects: EntityOption[];
};

const TYPE_LABELS: Record<string, string> = {
  company: "Unternehmen",
  contact: "Kontakt",
  project: "Projekt",
};

const TYPE_OPTIONS = [
  { value: "company", label: "Unternehmen" },
  { value: "contact", label: "Kontakt" },
  { value: "project", label: "Projekt" },
] as const;

export function SourceLinks({ sourceId, links, companies, contacts, projects }: Props) {
  const [selectedType, setSelectedType] = useState<string>("company");
  const [selectedId, setSelectedId] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const entityMap: Record<string, EntityOption[]> = {
    company: companies,
    contact: contacts,
    project: projects,
  };

  const options = entityMap[selectedType] ?? [];

  function handleAdd() {
    if (!selectedId) return;
    startTransition(async () => {
      await addSourceLink(sourceId, selectedType, selectedId);
      setSelectedId("");
    });
  }

  function handleRemove(linkId: string) {
    startTransition(() => removeSourceLink(linkId, sourceId));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Verknüpfungen
        </h2>
        <span className="text-xs" style={styles.muted}>
          {links.length} {links.length === 1 ? "Verknüpfung" : "Verknüpfungen"}
        </span>
      </div>

      {/* Existing links */}
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <div
              key={link.id}
              className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-full border text-sm"
              style={{ borderColor: "var(--color-line)", background: "var(--color-panel-strong)" }}
            >
              <span className="text-[10px] font-semibold uppercase" style={styles.muted}>
                {TYPE_LABELS[link.linked_type] ?? link.linked_type}
              </span>
              <span style={{ color: "var(--color-text)" }}>{link.linked_name}</span>
              <button
                type="button"
                onClick={() => handleRemove(link.id)}
                disabled={pending}
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs transition-colors hover:bg-[var(--color-danger-soft)]"
                style={{ color: "var(--color-muted)" }}
                title="Verknüpfung entfernen"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add link form */}
      <div className={`${card.flat} flex flex-col sm:flex-row gap-2`} style={styles.panel}>
        <select
          value={selectedType}
          onChange={(e) => {
            setSelectedType(e.target.value);
            setSelectedId("");
          }}
          className={input.base}
          style={{ ...styles.input, flex: "0 0 auto", maxWidth: "160px" }}
        >
          {TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className={input.base}
          style={{ ...styles.input, flex: 1 }}
        >
          <option value="">— Auswählen —</option>
          {options.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleAdd}
          disabled={pending || !selectedId}
          className={btn.primary}
          style={{
            ...styles.accent,
            opacity: pending || !selectedId ? 0.5 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {pending ? "…" : "Verknüpfen"}
        </button>
      </div>
    </div>
  );
}
