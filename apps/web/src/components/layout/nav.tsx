"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconHome,
  IconSources,
  IconSearch,
  IconChat,
  type NavItem,
} from "./nav-primitives";

// Mobile bottom nav — workspace defaults. Berater/HAIway can supply their own
// mobile nav via Shell's `mobileNav` prop in later sprints.
const mobileItems: NavItem[] = [
  { href: "/", label: "Start", icon: IconHome },
  { href: "/quellen", label: "Quellen", icon: IconSources },
  { href: "/search", label: "Suche", icon: IconSearch },
  { href: "/chat", label: "Chat", icon: IconChat },
];

export function MobileNav({ items = mobileItems }: { items?: NavItem[] } = {}) {
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
      {items.map((item) => {
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
