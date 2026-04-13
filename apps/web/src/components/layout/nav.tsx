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

function IconImport({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
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


function IconPhone({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function IconShield({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function IconAdmin({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconLogout({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
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
      { href: "/quellen", label: "Quellen", icon: IconSources },
      { href: "/sources", label: "Dateien", icon: IconImport },
      { href: "/papierkorb", label: "Papierkorb", icon: IconImport },
      { href: "/search", label: "Suche", icon: IconSearch },
      { href: "/chat", label: "Chat", icon: IconChat },
    ],
  },
];

// All items flat for mobile
const mobileItems: NavItem[] = [
  { href: "/", label: "Start", icon: IconHome },
  { href: "/quellen", label: "Quellen", icon: IconSources },
  { href: "/search", label: "Suche", icon: IconSearch },
  { href: "/chat", label: "Chat", icon: IconChat },
];

// ─── Desktop sidebar nav ──────────────────────────────────────────────

export function Nav({ isAdmin, hasPhoneAssistant }: { isAdmin?: boolean; hasPhoneAssistant?: boolean }) {
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

      {/* Berechtigungen — visible to all org members */}
      <div>
        <p
          className="text-[11px] font-semibold uppercase tracking-widest mb-1.5 px-3"
          style={{ color: "var(--color-placeholder)" }}
        >
          Verwaltung
        </p>
        <ul className="flex flex-col gap-0.5">
          <li>
            <NavLink item={{ href: "/berechtigungen", label: "Berechtigungen", icon: IconShield }} pathname={pathname} />
          </li>
        </ul>
      </div>

      {hasPhoneAssistant && (
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-widest mb-1.5 px-3"
            style={{ color: "var(--color-placeholder)" }}
          >
            Premium
          </p>
          <ul className="flex flex-col gap-0.5">
            <li>
              <NavLink item={{ href: "/telefon-assistent", label: "Telefon", icon: IconPhone }} pathname={pathname} />
            </li>
          </ul>
        </div>
      )}

      {isAdmin && (
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-widest mb-1.5 px-3"
            style={{ color: "var(--color-placeholder)" }}
          >
            Admin
          </p>
          <ul className="flex flex-col gap-0.5">
            <li>
              <NavLink item={{ href: "/admin", label: "Verwaltung", icon: IconAdmin }} pathname={pathname} />
            </li>
          </ul>
        </div>
      )}

      {/* Logout */}
      <div className="mt-auto pt-2">
        <form action="/auth/abmelden" method="POST">
          <button
            type="submit"
            className="flex items-center gap-2.5 min-h-[40px] px-3 rounded-xl text-[13px] font-medium w-full transition-all"
            style={{ color: "var(--color-muted)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--color-bg-elevated)";
              e.currentTarget.style.color = "var(--color-text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--color-muted)";
            }}
          >
            <IconLogout size={18} />
            Abmelden
          </button>
        </form>
      </div>
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
      className="flex items-center gap-2.5 min-h-[40px] px-3 rounded-xl text-[13px] font-medium transition-all"
      style={{
        background: active ? "var(--color-accent-soft)" : "transparent",
        color: active ? "var(--color-accent)" : "var(--color-muted)",
        fontWeight: active ? 600 : 500,
        transition: `all var(--duration-fast) var(--ease-out)`,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--color-bg-elevated)";
          e.currentTarget.style.color = "var(--color-text)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--color-muted)";
        }
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
        background: "color-mix(in srgb, var(--color-panel) 88%, transparent)",
      }}
    >
      {mobileItems.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center justify-center gap-0.5 flex-1 min-h-[44px] transition-colors"
            style={{
              color: active ? "var(--color-accent)" : "var(--color-muted)",
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
