// Shared constants for activities — safe for client and server use

export const ACTIVITY_TYPES = [
  { value: "note", label: "Notiz" },
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Anruf" },
  { value: "email", label: "E-Mail" },
  { value: "decision", label: "Entscheidung" },
  { value: "milestone", label: "Meilenstein" },
] as const;
