"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  {
    label: "Wissen",
    items: [
      { href: "/sources", label: "Quellen" },
      { href: "/search", label: "Suche" },
      { href: "/chat", label: "Chat" },
    ],
  },
  {
    label: "Operativ",
    items: [
      { href: "/companies", label: "Unternehmen" },
      { href: "/contacts", label: "Kontakte" },
      { href: "/projects", label: "Projekte" },
    ],
  },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.label}>
          <p
            className="text-xs font-semibold uppercase tracking-widest mb-2"
            style={{ color: "var(--color-muted)" }}
          >
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors"
                    style={{
                      background: active ? "var(--color-accent-soft)" : "transparent",
                      color: active ? "var(--color-accent)" : "var(--color-text)",
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
