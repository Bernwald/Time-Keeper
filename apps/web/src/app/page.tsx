import Link from "next/link";
import { listSources } from "@/lib/db/queries/sources";
import { listCompanies } from "@/lib/db/queries/companies";
import { listContacts } from "@/lib/db/queries/contacts";
import { listProjects } from "@/lib/db/queries/projects";
import { btn, page, styles } from "@/components/ui/table-classes";

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [sources, companies, contacts, projects] = await Promise.all([
    listSources(),
    listCompanies(),
    listContacts(),
    listProjects(),
  ]);
  const readySources = sources.filter((s) => s.status === "ready").length;

  return (
    <div className="flex flex-col">
      {/* ── Hero gradient banner ── */}
      <div
        className="gradient-accent px-4 md:px-8 py-8 md:py-12"
        style={{ color: "var(--color-accent-text)" }}
      >
        <div className="max-w-3xl animate-fade-in">
          <h1
            className="text-2xl md:text-4xl font-bold leading-tight tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Willkommen zurück
          </h1>
          <p className="text-sm md:text-base mt-2 opacity-80">
            Deine AI-Ready Wissensbasis. Inhalte hinzufügen, durchsuchen und per Chat abfragen.
          </p>
          <div className="flex flex-wrap gap-2.5 mt-5">
            <Link
              href="/sources/new"
              className={btn.primary}
              style={{
                background: "var(--color-panel)",
                color: "var(--color-accent)",
                fontWeight: 600,
              }}
            >
              + Quelle hinzufügen
            </Link>
            <Link
              href="/chat"
              className={btn.secondary}
              style={{
                background: "rgba(255,255,255,0.15)",
                color: "var(--color-accent-text)",
                border: "1px solid rgba(255,255,255,0.3)",
              }}
            >
              Chat starten
            </Link>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className={page.wrapper}>
        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 stagger-children -mt-6 md:-mt-8">
          <StatCard value={readySources} label="Quellen" href="/sources" color="var(--color-accent)" />
          <StatCard value={companies.length} label="Unternehmen" href="/companies" color="var(--color-info)" />
          <StatCard value={contacts.length} label="Kontakte" href="/contacts" color="var(--color-warning)" />
          <StatCard value={projects.length} label="Projekte" href="/projects" color="var(--color-success)" />
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2.5 animate-fade-in">
          <Link
            href="/search"
            className={btn.secondary}
            style={{
              background: "var(--color-panel)",
              color: "var(--color-text)",
              border: "1px solid var(--color-line)",
              boxShadow: "var(--shadow-xs)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.35-4.35" />
            </svg>
            Suchen
          </Link>
          <Link
            href="/companies/new"
            className={btn.secondary}
            style={{
              background: "var(--color-panel)",
              color: "var(--color-text)",
              border: "1px solid var(--color-line)",
              boxShadow: "var(--shadow-xs)",
            }}
          >
            + Unternehmen
          </Link>
          <Link
            href="/contacts/new"
            className={btn.secondary}
            style={{
              background: "var(--color-panel)",
              color: "var(--color-text)",
              border: "1px solid var(--color-line)",
              boxShadow: "var(--shadow-xs)",
            }}
          >
            + Kontakt
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
                Alle anzeigen →
              </Link>
            </div>
            <div className="flex flex-col gap-2 stagger-children">
              {sources.slice(0, 5).map((s) => (
                <Link
                  key={s.id}
                  href={`/sources/${s.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl min-h-[44px] transition-all hover:shadow-sm"
                  style={{
                    background: "var(--color-panel)",
                    border: "1px solid var(--color-line)",
                  }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
                      style={{
                        background: s.source_type === "pdf" ? "var(--color-warning-soft)" : s.source_type === "transcript" ? "var(--color-info-soft)" : "var(--color-accent-soft)",
                        color: s.source_type === "pdf" ? "var(--color-warning)" : s.source_type === "transcript" ? "var(--color-info)" : "var(--color-accent)",
                      }}
                    >
                      {s.source_type === "pdf" ? "PDF" : s.source_type === "transcript" ? "TR" : "TXT"}
                    </div>
                    <span className="text-sm font-medium truncate" style={{ color: "var(--color-text)" }}>
                      {s.title}
                    </span>
                  </div>
                  <span className="text-[11px] shrink-0" style={{ color: "var(--color-placeholder)" }}>
                    {new Date(s.created_at).toLocaleDateString("de-DE")}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ value, label, href, color }: { value: number; label: string; href: string; color: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl p-4 md:p-5 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
      style={{
        background: "var(--color-panel)",
        border: "1px solid var(--color-line)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <span
        className="text-3xl md:text-4xl font-bold block"
        style={{ fontFamily: "var(--font-display)", color }}
      >
        {value}
      </span>
      <span className="text-sm font-medium block mt-1" style={{ color: "var(--color-muted)" }}>
        {label}
      </span>
    </Link>
  );
}
