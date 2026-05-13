import Link from "next/link";
import { MobileNav } from "./nav";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Wordmark } from "./wordmark";
import type { OrgBranding } from "@/lib/db/queries/organization";
import type { ReactNode } from "react";

type ShellProps = {
  children: ReactNode;
  branding?: OrgBranding;
  /** Sidebar navigation slot — pass nav-haiway, nav-berater, or nav-workspace. */
  nav: ReactNode;
  /** Mobile bottom-nav items; defaults to workspace items. */
  mobileNav?: ReactNode;
};

export function Shell({ children, branding, nav, mobileNav }: ShellProps) {
  const displayName = branding?.displayName ?? "HAIway";
  const shortName = branding?.shortName ?? "HA";

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row">
      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden md:flex flex-col shrink-0 sticky top-0 h-[100dvh] overflow-y-auto"
        style={{
          width: "var(--sidebar-w)",
          borderRight: "1px solid var(--color-line)",
          background: "var(--color-panel)",
        }}
      >
        <div className="p-5 pb-3">
          <Link href="/" className="flex items-center gap-3 group">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 gradient-accent"
              style={{ color: "var(--color-accent-text)", boxShadow: "0 2px 8px rgba(13, 148, 136, 0.3)" }}
            >
              {shortName}
            </div>
            <div className="flex flex-col">
              <Wordmark
                name={displayName}
                className="text-[15px] font-semibold leading-tight"
                style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
              />
              <span className="text-[11px] leading-tight" style={{ color: "var(--color-placeholder)" }}>
                Knowledge Platform
              </span>
            </div>
          </Link>
        </div>

        <div className="flex-1 px-3 py-3 overflow-y-auto">{nav}</div>

        <div className="p-4 border-t" style={{ borderColor: "var(--color-line)" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: "var(--color-success)" }} />
              <p className="text-[11px]" style={{ color: "var(--color-placeholder)" }}>
                v0.1 · System bereit
              </p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      {/* ── Mobile header ── */}
      <header
        className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 glass"
        style={{
          height: "var(--header-h)",
          borderBottom: "1px solid var(--color-line)",
          background: "color-mix(in srgb, var(--color-panel) 80%, transparent)",
        }}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold gradient-accent"
            style={{ color: "var(--color-accent-text)" }}
          >
            {shortName}
          </div>
          <Wordmark
            name={displayName}
            className="text-sm font-semibold"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <form action="/auth/abmelden" method="POST">
            <button
              type="submit"
              aria-label="Abmelden"
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg"
              style={{ color: "var(--color-muted)" }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </form>
        </div>
      </header>

      {/* ── Main ── */}
      <main
        className="flex-1 min-w-0 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] md:pb-0"
        style={{ background: "var(--color-bg)" }}
      >
        {children}
      </main>

      {mobileNav ?? <MobileNav />}
    </div>
  );
}
