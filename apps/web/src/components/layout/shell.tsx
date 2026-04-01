import Link from "next/link";
import { Nav, MobileNav } from "./nav";
import type { OrgBranding } from "@/lib/db/queries/organization";

type ShellProps = {
  children: React.ReactNode;
  branding?: OrgBranding;
  isAdmin?: boolean;
};

export function Shell({ children, branding, isAdmin }: ShellProps) {
  const displayName = branding?.displayName ?? "Time Keeper";
  const shortName = branding?.shortName ?? "TK";

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row">
      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden md:flex flex-col shrink-0 sticky top-0 h-[100dvh] overflow-y-auto"
        style={{
          width: "var(--sidebar-w)",
          borderRight: "1px solid var(--color-line)",
          background: "#fff",
        }}
      >
        <div className="p-5 pb-3">
          <Link href="/" className="flex items-center gap-3 group">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 gradient-accent"
              style={{ color: "#fff", boxShadow: "0 2px 8px rgba(13, 148, 136, 0.3)" }}
            >
              {shortName}
            </div>
            <div className="flex flex-col">
              <span
                className="text-[15px] font-semibold leading-tight"
                style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
              >
                {displayName}
              </span>
              <span className="text-[11px] leading-tight" style={{ color: "var(--color-placeholder)" }}>
                Knowledge Platform
              </span>
            </div>
          </Link>
        </div>

        <div className="flex-1 px-3 py-3 overflow-y-auto">
          <Nav isAdmin={isAdmin} />
        </div>

        <div className="p-4 border-t" style={{ borderColor: "var(--color-line)" }}>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: "var(--color-success)" }} />
            <p className="text-[11px]" style={{ color: "var(--color-placeholder)" }}>
              v0.1 · System bereit
            </p>
          </div>
        </div>
      </aside>

      {/* ── Mobile header ── */}
      <header
        className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 glass"
        style={{
          height: "var(--header-h)",
          borderBottom: "1px solid var(--color-line)",
          background: "rgba(255, 255, 255, 0.8)",
        }}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold gradient-accent"
            style={{ color: "#fff" }}
          >
            {shortName}
          </div>
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            {displayName}
          </span>
        </Link>
      </header>

      {/* ── Main ── */}
      <main
        className="flex-1 min-w-0 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] md:pb-0"
        style={{ background: "var(--color-bg)" }}
      >
        {children}
      </main>

      <MobileNav />
    </div>
  );
}
