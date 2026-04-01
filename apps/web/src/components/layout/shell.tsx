import Link from "next/link";
import { Nav } from "./nav";

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid" style={{ gridTemplateColumns: "240px minmax(0,1fr)" }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col p-6 gap-8"
        style={{
          borderRight: "1px solid var(--color-line)",
          background: "var(--color-panel)",
        }}
      >
        {/* Brand */}
        <Link href="/" className="flex flex-col gap-0.5">
          <span
            className="text-lg font-semibold leading-tight"
            style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
          >
            Time Keeper
          </span>
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            Knowledge Platform
          </span>
        </Link>

        <Nav />
      </aside>

      {/* Main */}
      <main className="flex flex-col min-h-screen" style={{ background: "var(--color-bg)" }}>
        {children}
      </main>
    </div>
  );
}
