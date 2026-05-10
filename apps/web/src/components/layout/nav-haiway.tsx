"use client";

import {
  IconHome,
  IconUsers,
  IconChart,
  IconBox,
  IconBuilding,
  IconAdmin,
  NavLink,
  NavGroupBlock,
  NavLogout,
  type NavGroup,
} from "./nav-primitives";

/**
 * HAIway-internes Cockpit — für unser eigenes Team (profiles.is_platform_admin = true).
 * Operatives + strategisches Dashboard: Kundenliste, übergreifende KPIs,
 * internes Tool-Inventar (Marketplace = Katalog "kaufen vs bauen", kein Kundenprodukt),
 * interne CRM/HR-Stubs.
 *
 * Phase 1: zeigt heutigen /admin-Bereich. Sprint D zieht physisch nach (haiway)/haiway/*.
 */
const groups: NavGroup[] = [
  {
    label: "Kunden",
    items: [
      { href: "/admin/kunden", label: "Kundenliste", icon: IconUsers },
      { href: "/admin/branding", label: "Branding", icon: IconBuilding },
      { href: "/admin/mein-unternehmen", label: "Mein Unternehmen", icon: IconAdmin },
    ],
  },
  {
    label: "Plattform",
    items: [
      { href: "/admin/integrationen", label: "Integrationen", icon: IconBox },
      { href: "/admin/ai-settings", label: "KI-Einstellungen", icon: IconAdmin },
      { href: "/admin/retrieval-qualitaet", label: "Retrieval-Qualität", icon: IconChart },
      { href: "/admin/tags", label: "Tags", icon: IconBox },
    ],
  },
  {
    label: "Intern",
    items: [
      { href: "/haiway/tools", label: "Tool-Inventar", icon: IconBox },
      { href: "/haiway/kpis", label: "KPIs", icon: IconChart },
    ],
  },
];

export function NavHaiway() {
  return (
    <nav className="flex flex-col gap-6">
      <div>
        <NavLink item={{ href: "/", label: "Übersicht", icon: IconHome }} exact />
      </div>
      {groups.map((group) => (
        <NavGroupBlock key={group.label} group={group} />
      ))}
      <NavLogout />
    </nav>
  );
}
