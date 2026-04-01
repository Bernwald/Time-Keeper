"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ─── Icons (inline SVG, 20×20) ────────────────────────────────────────

function IconHome({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

function IconSources({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16v16H4z" />
      <path d="M4 9h16M9 4v16" />
    </svg>
  );
}

function IconSearch({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function IconChat({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

function IconCompany({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4" />
      <path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01" />
    </svg>
  );
}

function IconContacts({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function IconProjects({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
      <path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
    </svg>
  );
}

// ─── Types ─────────────────────────────────────────────────────────────

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    label: "Wissen",
    items: [
      { href: "/sources", label: "Quellen", icon: IconSources },
      { href: "/search", label: "Suche", icon: IconSearch },
      { href: "/chat", label: "Chat", icon: IconChat },
    ],
  },
  {
    label: "Operativ",
    items: [
      { href: "/companies", label: "Unternehmen", icon: IconCompany },
      { href: "/contacts", label: "Kontakte", icon: IconContacts },
      { href: "/projects", label: "Projekte", icon: IconProjects },
    ],
  },
];

// All items flat for mobile
const mobileItems: NavItem[] = [
  { href: "/", label: "Start", icon: IconHome },
  { href: "/sources", label: "Quellen", icon: IconSources },
  { href: "/search", label: "Suche", icon: IconSearch },
  { href: "/chat", label: "Chat", icon: IconChat },
  { href: "/companies", label: "Mehr", icon: IconCompany },
];

// ─── Desktop sidebar nav ──────────────────────────────────────────────

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6">
      {/* Dashboard link */}
      <div>
        <NavLink item={{ href: "/", label: "Übersicht", icon: IconHome }} pathname={pathname} exact />
      </div>

      {groups.map((group) => (
        <div key={group.label}>
          <p
            className="text-[11px] font-semibold uppercase tracking-widest mb-1.5 px-3"
            style={{ color: "var(--color-placeholder)" }}
          >
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <NavLink item={item} pathname={pathname} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function NavLink({
  item,
  pathname,
  exact,
}: {
  item: NavItem;
  pathname: string;
  exact?: boolean;
}) {
  const active = exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      className="flex items-center gap-2.5 min-h-[40px] px-3 rounded-lg text-[13px] font-medium transition-all"
      style={{
        background: active ? "var(--color-accent-soft)" : "transparent",
        color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
        transition: `all var(--duration-fast) var(--ease-out)`,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "var(--color-bg-elevated)";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon size={18} />
      {item.label}
    </Link>
  );
}

// ─── Mobile bottom nav ────────────────────────────────────────────────

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch justify-around glass"
      style={{
        height: `calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))`,
        paddingBottom: "env(safe-area-inset-bottom)",
        borderTop: "1px solid var(--color-line-soft)",
        background: "rgba(255, 253, 248, 0.88)",
      }}
    >
      {mobileItems.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        // "Mehr" covers operative pages
        const isMore = item.label === "Mehr";
        const moreActive =
          isMore &&
          (pathname.startsWith("/companies") ||
            pathname.startsWith("/contacts") ||
            pathname.startsWith("/projects"));
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[44px] transition-colors"
            style={{
              color: active || moreActive ? "var(--color-accent)" : "var(--color-muted)",
            }}
          >
            <Icon size={22} />
            <span className="text-[10px] font-medium leading-none">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
