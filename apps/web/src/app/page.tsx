import Link from "next/link";
import { listSources } from "@/lib/db/queries/sources";
import { listCompanies } from "@/lib/db/queries/companies";
import { listContacts } from "@/lib/db/queries/contacts";
import { listProjects } from "@/lib/db/queries/projects";
import { card, btn, page, styles } from "@/components/ui/table-classes";

function StatCard({
  label,
  value,
  href,
  color,
}: {
  label: string;
  value: number;
  href: string;
  color: string;
}) {
  return (
    <Link href={href} className={card.interactive} style={styles.panel}>
      <div className="flex items-start justify-between mb-3">
        <span
          className="text-3xl md:text-4xl font-semibold"
          style={{ fontFamily: "var(--font-display)", color }}
        >
          {value}
        </span>
      </div>
      <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
        {label}
      </span>
    </Link>
  );
}

export default async function HomePage() {
  const [sources, companies, contacts, projects] = await Promise.all([
    listSources(),
    listCompanies(),
    listContacts(),
    listProjects(),
  ]);

  const readySources = sources.filter((s) => s.status === "ready").length;

  return (
    <div className={page.wrapper}>
      {/* Hero */}
      <div className="animate-fade-in">
        <h1
          className="text-2xl md:text-3xl font-semibold leading-tight"
          style={styles.title}
        >
          Übersicht
        </h1>
        <p className="text-sm mt-1" style={styles.muted}>
          Deine Wissensbasis auf einen Blick.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 stagger-children">
        <StatCard label="Quellen" value={readySources} href="/sources" color="var(--color-accent)" />
        <StatCard label="Unternehmen" value={companies.length} href="/companies" color="var(--color-info)" />
        <StatCard label="Kontakte" value={contacts.length} href="/contacts" color="var(--color-warning)" />
        <StatCard label="Projekte" value={projects.length} href="/projects" color="var(--color-success)" />
      </div>

      {/* Quick actions */}
      <div className="animate-fade-in flex flex-wrap gap-2.5">
        <Link href="/sources/new" className={btn.primary} style={styles.accent}>
          + Quelle hinzufügen
        </Link>
        <Link
          href="/search"
          className={btn.secondary}
          style={{ ...styles.panel, color: "var(--color-text)" }}
        >
          Suchen
        </Link>
        <Link
          href="/chat"
          className={btn.secondary}
          style={{ ...styles.panel, color: "var(--color-text)" }}
        >
          Chat starten
        </Link>
      </div>

      {/* Recent sources */}
      {sources.length > 0 && (
        <div className="flex flex-col gap-3 animate-slide-up">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              Zuletzt hinzugefügt
            </h2>
            <Link href="/sources" className="text-xs font-medium" style={{ color: "var(--color-accent)" }}>
              Alle →
            </Link>
          </div>
          <div className="flex flex-col gap-2 stagger-children">
            {sources.slice(0, 5).map((source) => (
              <Link
                key={source.id}
                href={`/sources/${source.id}`}
                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-[var(--radius-md)] min-h-[44px] transition-all hover:shadow-[var(--shadow-xs)]`}
                style={styles.panel}
              >
                <span className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>
                  {source.title}
                </span>
                <span className="text-[11px] shrink-0" style={styles.muted}>
                  {new Date(source.created_at).toLocaleDateString("de-DE")}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
