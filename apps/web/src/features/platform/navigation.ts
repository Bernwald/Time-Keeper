export type NavItem = {
  label: string;
  href: string;
};

export type NavGroup = {
  key: string;
  label: string;
  items: NavItem[];
};

export const navigationGroups: NavGroup[] = [
  {
    key: "crm",
    label: "CRM",
    items: [
      { label: "Unternehmen", href: "/companies" },
      { label: "Kontakte", href: "/contacts" },
      { label: "Projekte", href: "/projects" },
    ],
  },
  {
    key: "operations",
    label: "Operativ",
    items: [
      { label: "Interaktionen", href: "/interactions" },
      { label: "Aufgaben", href: "/tasks" },
    ],
  },
  {
    key: "knowledge",
    label: "Wissen",
    items: [
      { label: "Quellen", href: "/sources" },
      { label: "Inhalte", href: "/content" },
      { label: "Dokumente", href: "/documents" },
    ],
  },
];

// Keep backward compatibility - flat list for any code that uses it
export const navigationItems: NavItem[] = navigationGroups.flatMap((g) => g.items);
