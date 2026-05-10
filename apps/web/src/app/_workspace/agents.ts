// Stub-Agenten für die Workspace-Home. In Sprint C bekommt der Berater ein
// Cockpit, in dem er pro Kunden-Org eigene Agenten konfiguriert (Tabelle
// `agent_templates` o. ä.). Bis dahin liegt hier eine Hardcode-Liste; sie ist
// ausreichend, um die End-User-UX zu validieren — der Pre-Prompt fließt 1:1
// in die Konversation.

export type WorkspaceAgent = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  /** Tailwind-color-Token-Name (für die Tile-Akzentfarbe). */
  accent: "teal" | "amber" | "violet" | "rose" | "sky";
  icon: "draft" | "briefing" | "mail" | "summary";
};

export const STUB_AGENTS: WorkspaceAgent[] = [
  {
    id: "angebot",
    name: "Angebot entwerfen",
    description: "Erstellt einen Angebotsentwurf auf Basis der Kundendaten.",
    prompt:
      "Bitte entwirf ein Angebot. Frag mich zuerst, für welchen Kunden und welches Projekt — danach nutzt du die hinterlegten Stammdaten und vergleichbare frühere Angebote als Vorlage.",
    accent: "teal",
    icon: "draft",
  },
  {
    id: "briefing",
    name: "Kunden-Briefing",
    description: "Fasst Status, letzte Aktivitäten und offene Punkte zusammen.",
    prompt:
      "Erstelle ein kurzes Briefing für ein Kundengespräch. Frag mich zuerst, um welchen Kunden es geht, dann fasse aus den Quellen zusammen: Status, letzte Aktivitäten, offene Themen, Risiken.",
    accent: "violet",
    icon: "briefing",
  },
  {
    id: "mail",
    name: "E-Mail-Antwort",
    description: "Schreibt eine professionelle Antwort auf eine E-Mail.",
    prompt:
      "Hilf mir, eine E-Mail zu beantworten. Ich gebe dir gleich den Text der eingehenden Mail — du formulierst eine professionelle, freundliche, deutsche Antwort und nutzt unsere bisherige Kommunikation als Kontext.",
    accent: "sky",
    icon: "mail",
  },
  {
    id: "summary",
    name: "Gespräch zusammenfassen",
    description: "Extrahiert Action Items aus einem Transkript.",
    prompt:
      "Fasse mir ein Gespräch zusammen. Sag mir gleich, welches Transkript oder Meeting du meinst — ich extrahiere die wichtigsten Punkte, Entscheidungen und Action Items mit Verantwortlichen.",
    accent: "amber",
    icon: "summary",
  },
];
