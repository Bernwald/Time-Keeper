"use client";

import {
  IconHome,
  IconSources,
  IconShield,
  IconChart,
  IconPlug,
  IconPhone,
  IconBuilding,
  NavLink,
  NavGroupBlock,
  NavLogout,
  type NavGroup,
} from "./nav-primitives";

/**
 * Berater-Cockpit-Sidebar — Kunden-Admin (organization_members.role IN ('admin','owner')).
 * Konfiguriert pro Kunden-Org: Datenpools, Berechtigungen, KPIs, Integrationen.
 *
 * Phase 1: Stub-Routen verlinken auf vorhandene Verwaltungsseiten.
 * Sprint C zieht die echten Berater-Pfade unter (berater)/admin/*.
 */
export function NavBerater({ hasPhoneAssistant }: { hasPhoneAssistant?: boolean }) {
  const groups: NavGroup[] = [
    {
      label: "Kunde",
      items: [
        { href: "/admin/mein-unternehmen", label: "Übersicht", icon: IconBuilding },
      ],
    },
    {
      label: "Daten & Zugriff",
      items: [
        { href: "/quellen", label: "Quellen-Pools", icon: IconSources },
        { href: "/berechtigungen", label: "Berechtigungen", icon: IconShield },
      ],
    },
    {
      label: "Outcome",
      items: [
        { href: "/admin/retrieval-qualitaet", label: "KPIs", icon: IconChart },
      ],
    },
    {
      label: "System",
      items: [
        { href: "/admin/integrationen", label: "Integrationen", icon: IconPlug },
        ...(hasPhoneAssistant
          ? [{ href: "/telefon-assistent", label: "Telefon", icon: IconPhone }]
          : []),
      ],
    },
  ];

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
