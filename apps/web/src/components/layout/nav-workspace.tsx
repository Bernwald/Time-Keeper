"use client";

import {
  IconHome,
  IconSources,
  IconImport,
  IconTrash,
  IconSearch,
  IconChat,
  IconPhone,
  NavLink,
  NavGroupBlock,
  NavLogout,
  type NavGroup,
} from "./nav-primitives";

const groups: NavGroup[] = [
  {
    label: "Wissen",
    items: [
      { href: "/quellen", label: "Quellen", icon: IconSources },
      { href: "/sources", label: "Dateien", icon: IconImport },
      { href: "/papierkorb", label: "Papierkorb", icon: IconTrash },
      { href: "/search", label: "Suche", icon: IconSearch },
      { href: "/chat", label: "Chat", icon: IconChat },
    ],
  },
];

/**
 * Workspace-Sidebar — End-User-Sicht für Kundenmitarbeiter.
 * Kuratierte Oberfläche, keine Verwaltung.
 */
export function NavWorkspace({ hasPhoneAssistant }: { hasPhoneAssistant?: boolean }) {
  return (
    <nav className="flex flex-col gap-6">
      <div>
        <NavLink item={{ href: "/", label: "Übersicht", icon: IconHome }} exact />
      </div>

      {groups.map((group) => (
        <NavGroupBlock key={group.label} group={group} />
      ))}

      {hasPhoneAssistant && (
        <NavGroupBlock
          group={{
            label: "Premium",
            items: [{ href: "/telefon-assistent", label: "Telefon", icon: IconPhone }],
          }}
        />
      )}

      <NavLogout />
    </nav>
  );
}
