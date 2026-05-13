"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type ShellTab = {
  href: string;
  label: string;
  /** "Aktiv"-Match: bei "exact" muss pathname === href stimmen, sonst startsWith. */
  match?: "exact" | "prefix";
};

/**
 * Top-Tabs unterhalb der Shell-Top-Bar — wird vom Berater-Cockpit und vom
 * HAIway-Mission-Control genutzt. Mobile-tauglich: horizontal scrollbar.
 */
export function ShellTabs({ tabs }: { tabs: ShellTab[] }) {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-[var(--header-h)] z-30"
      style={{
        background: "color-mix(in srgb, var(--color-panel) 92%, transparent)",
        borderBottom: "1px solid var(--color-line-soft)",
        backdropFilter: "blur(8px)",
      }}
    >
      <ul className="flex items-stretch gap-1 px-3 md:px-8 overflow-x-auto no-scrollbar">
        {tabs.map((tab) => {
          const isExact = tab.match === "exact";
          const active = isExact
            ? pathname === tab.href
            : pathname === tab.href || pathname.startsWith(tab.href + "/");
          return (
            <li key={tab.href} className="shrink-0">
              <Link
                href={tab.href}
                className="inline-flex items-center min-h-[44px] px-3 md:px-4 text-[13px] font-medium transition-colors relative"
                style={{
                  color: active ? "var(--color-text)" : "var(--color-muted)",
                }}
              >
                {tab.label}
                <span
                  aria-hidden
                  className="absolute left-2 right-2 bottom-0 h-[2px] rounded-full transition-opacity"
                  style={{
                    background: "var(--color-accent)",
                    opacity: active ? 1 : 0,
                  }}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
