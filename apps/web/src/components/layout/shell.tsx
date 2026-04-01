import Link from "next/link";
import { Nav, MobileNav } from "./nav";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row">
      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <aside
        className="hidden md:flex flex-col shrink-0 sticky top-0 h-[100dvh] overflow-y-auto"
        style={{
          width: "var(--sidebar-w)",
          borderRight: "1px solid var(--color-line-soft)",
          background: "var(--color-panel)",
        }}
      >
        {/* Brand */}
        <div className="p-5 pb-2">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
              style={{ background: "var(--color-accent)", color: "var(--color-accent-text)" }}
            >
              TK
            </div>
            <div className="flex flex-col">
              <span
                className="text-[15px] font-semibold leading-tight"
                style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
              >
                Time Keeper
              </span>
              <span className="text-[11px] leading-tight" style={{ color: "var(--color-muted)" }}>
                Knowledge Platform
              </span>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <div className="flex-1 px-3 py-4">
          <Nav />
        </div>

        {/* Footer */}
        <div className="p-4 border-t" style={{ borderColor: "var(--color-line-soft)" }}>
          <p className="text-[11px]" style={{ color: "var(--color-placeholder)" }}>
            v0.1 · AI-Ready Platform
          </p>
        </div>
      </aside>

      {/* ── Mobile header (hidden on desktop) ── */}
      <header
        className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 glass"
        style={{
          height: "var(--header-h)",
          borderBottom: "1px solid var(--color-line-soft)",
          background: "rgba(255, 253, 248, 0.85)",
        }}
      >
        <Link href="/" className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold"
            style={{ background: "var(--color-accent)", color: "var(--color-accent-text)" }}
          >
            TK
          </div>
          <span
            className="text-sm font-semibold"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            Time Keeper
          </span>
        </Link>
      </header>

      {/* ── Main content ── */}
      <main
        className="flex-1 min-w-0 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] md:pb-0"
        style={{ background: "var(--color-bg)" }}
      >
        {children}
      </main>

      {/* ── Mobile bottom nav (hidden on desktop) ── */}
      <MobileNav />
    </div>
  );
}
