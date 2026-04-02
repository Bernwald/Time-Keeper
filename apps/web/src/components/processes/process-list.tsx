import Link from "next/link";
import type { ProcessInstance } from "@/lib/db/queries/processes";
import { badge } from "@/components/ui/table-classes";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Aktiv", color: "var(--color-success)", bg: "var(--color-success-soft)" },
  completed: { label: "Fertig", color: "var(--color-accent)", bg: "var(--color-accent-soft)" },
  paused: { label: "Pausiert", color: "var(--color-warning)", bg: "var(--color-warning-soft)" },
  cancelled: { label: "Abgebr.", color: "var(--color-danger)", bg: "var(--color-danger-soft)" },
};

export function ProcessList({ instances }: { instances: ProcessInstance[] }) {
  if (instances.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
        Prozesse
      </h2>
      <div className="flex flex-col gap-2">
        {instances.map((inst) => {
          const config = STATUS_CONFIG[inst.status] ?? STATUS_CONFIG.active;
          return (
            <Link
              key={inst.id}
              href={`/processes/${inst.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl min-h-[44px] transition-all hover:shadow-sm"
              style={{
                background: "#fff",
                border: "1px solid var(--color-line)",
              }}
            >
              <span className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>
                {inst.name}
              </span>
              <span className={badge.pill} style={{ background: config.bg, color: config.color }}>
                {config.label}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
