import Link from "next/link";
import { listCompanies } from "@/lib/db/queries/companies";
import { card, badge, btn } from "@/components/ui/table-classes";

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    active: { bg: "var(--color-accent-soft)", text: "var(--color-accent)" },
    inactive: { bg: "#f3f4f6", text: "#6b7280" },
    archived: { bg: "#f3f4f6", text: "#9ca3af" },
  };
  const c = colors[status] ?? colors.inactive;
  const label: Record<string, string> = { active: "Aktiv", inactive: "Inaktiv", archived: "Archiviert" };
  return (
    <span className={badge.base} style={{ background: c.bg, color: c.text }}>
      {label[status] ?? status}
    </span>
  );
}

export default async function CompaniesPage() {
  const companies = await listCompanies();

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            Unternehmen
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
            {companies.length} {companies.length === 1 ? "Unternehmen" : "Unternehmen"} gespeichert
          </p>
        </div>
        <Link
          href="/companies/new"
          className={btn.primary}
          style={{ background: "var(--color-accent)", color: "#fff" }}
        >
          + Neu
        </Link>
      </div>

      {companies.length === 0 && (
        <div
          className={`${card.base} flex flex-col items-center justify-center gap-3 py-16 text-center`}
          style={{ background: "var(--color-panel)", border: "1px solid var(--color-line)" }}
        >
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            Noch keine Unternehmen vorhanden.
          </p>
          <Link
            href="/companies/new"
            className={btn.primary}
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            Erstes Unternehmen anlegen
          </Link>
        </div>
      )}

      {companies.length > 0 && (
        <div className="flex flex-col gap-3">
          {companies.map((company) => (
            <Link
              key={company.id}
              href={`/companies/${company.id}`}
              className={`${card.hover} flex items-center justify-between gap-4`}
              style={{
                background: "var(--color-panel)",
                border: "1px solid var(--color-line)",
                boxShadow: "var(--shadow-card)",
                textDecoration: "none",
              }}
            >
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <span className="text-base font-medium truncate" style={{ color: "var(--color-text)" }}>
                  {company.name}
                </span>
                {company.website && (
                  <span className="text-xs truncate" style={{ color: "var(--color-muted)" }}>
                    {company.website}
                  </span>
                )}
              </div>
              <StatusBadge status={company.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
