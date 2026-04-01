import Link from "next/link";
import { listCompanies } from "@/lib/db/queries/companies";
import { card, badge, btn, page, styles } from "@/components/ui/table-classes";

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; style: { background: string; color: string } }> = {
  active: { label: "Aktiv", style: { background: "var(--color-success-soft)", color: "var(--color-success)" } },
  inactive: { label: "Inaktiv", style: { background: "var(--color-bg-elevated)", color: "var(--color-muted)" } },
  archived: { label: "Archiviert", style: { background: "var(--color-bg-elevated)", color: "var(--color-placeholder)" } },
};

export default async function CompaniesPage() {
  const companies = await listCompanies();

  return (
    <div className={page.wrapper}>
      <div className={page.headerRow}>
        <div className={`${page.header} animate-fade-in`}>
          <h1 className="text-2xl md:text-3xl font-semibold" style={styles.title}>Unternehmen</h1>
          <p className="text-sm" style={styles.muted}>
            {companies.length} {companies.length === 1 ? "Unternehmen" : "Unternehmen"}
          </p>
        </div>
        <Link href="/companies/new" className={btn.primary} style={styles.accent}>+ Neu</Link>
      </div>

      {companies.length === 0 ? (
        <div className={`${card.base} flex flex-col items-center gap-3 py-12 text-center animate-scale-in`} style={styles.panel}>
          <p className="text-sm" style={styles.muted}>Noch keine Unternehmen vorhanden.</p>
          <Link href="/companies/new" className={btn.primary} style={styles.accent}>Erstes Unternehmen anlegen</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5 stagger-children">
          {companies.map((c) => {
            const s = STATUS[c.status] ?? STATUS.inactive;
            return (
              <Link key={c.id} href={`/companies/${c.id}`} className={card.hover} style={styles.panel}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span className="text-[15px] font-medium truncate" style={{ color: "var(--color-text)" }}>{c.name}</span>
                    {c.website && <span className="text-xs truncate" style={styles.muted}>{c.website}</span>}
                  </div>
                  <span className={badge.pill} style={s.style}>{s.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
