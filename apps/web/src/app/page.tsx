import Link from "next/link";
import { listSources } from "@/lib/db/queries/sources";
import { listCompanies } from "@/lib/db/queries/companies";
import { listContacts } from "@/lib/db/queries/contacts";
import { listProjects } from "@/lib/db/queries/projects";
import { card, btn } from "@/components/ui/table-classes";

async function StatCard({
  label,
  value,
  href,
  actionLabel,
}: {
  label: string;
  value: number;
  href: string;
  actionLabel: string;
}) {
  return (
    <Link
      href={href}
      className={`${card.hover} flex flex-col gap-1`}
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-line)",
        boxShadow: "var(--shadow-card)",
        textDecoration: "none",
      }}
    >
      <span
        className="text-3xl font-semibold"
        style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
      >
        {value}
      </span>
      <span className="text-sm" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
      <span
        className="text-xs mt-1 font-medium"
        style={{ color: "var(--color-accent)" }}
      >
        {actionLabel} →
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
    <div className="flex flex-col gap-8 p-6 lg:p-8">
      {/* Hero */}
      <div>
        <h1
          className="text-3xl font-semibold leading-tight"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Übersicht
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          AI-Ready Knowledge Platform — Deine Wissensbasis auf einen Blick.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Wissensquellen"
          value={readySources}
          href="/sources"
          actionLabel="Quellen verwalten"
        />
        <StatCard
          label="Unternehmen"
          value={companies.length}
          href="/companies"
          actionLabel="Unternehmen anzeigen"
        />
        <StatCard
          label="Kontakte"
          value={contacts.length}
          href="/contacts"
          actionLabel="Kontakte anzeigen"
        />
        <StatCard
          label="Projekte"
          value={projects.length}
          href="/projects"
          actionLabel="Projekte anzeigen"
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-col gap-3">
        <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
          Schnellzugriff
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/sources/new"
            className={btn.primary}
            style={{ background: "var(--color-accent)", color: "#fff" }}
          >
            + Quelle hinzufügen
          </Link>
          <Link
            href="/search"
            className={btn.ghost}
            style={{
              background: "var(--color-panel)",
              color: "var(--color-text)",
              border: "1px solid var(--color-line)",
            }}
          >
            Suchen
          </Link>
          <Link
            href="/chat"
            className={btn.ghost}
            style={{
              background: "var(--color-panel)",
              color: "var(--color-text)",
              border: "1px solid var(--color-line)",
            }}
          >
            Chat starten
          </Link>
        </div>
      </div>

      {/* Recent sources */}
      {sources.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold" style={{ color: "var(--color-text)" }}>
              Zuletzt hinzugefügt
            </h2>
            <Link href="/sources" className="text-sm" style={{ color: "var(--color-accent)" }}>
              Alle anzeigen →
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            {sources.slice(0, 5).map((source) => (
              <Link
                key={source.id}
                href={`/sources/${source.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl min-h-[44px] transition-colors"
                style={{
                  background: "var(--color-panel)",
                  border: "1px solid var(--color-line)",
                  textDecoration: "none",
                }}
              >
                <span className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>
                  {source.title}
                </span>
                <span className="text-xs shrink-0" style={{ color: "var(--color-muted)" }}>
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
