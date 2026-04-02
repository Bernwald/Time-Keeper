// Shared constants for phone assistant — safe for client and server use

export const VOICE_OPTIONS = [
  { value: "alloy", label: "Alloy (neutral)" },
  { value: "echo", label: "Echo (maennlich)" },
  { value: "fable", label: "Fable (britisch)" },
  { value: "onyx", label: "Onyx (tief)" },
  { value: "nova", label: "Nova (weiblich)" },
  { value: "shimmer", label: "Shimmer (warm)" },
] as const;

export const LANGUAGE_MODES = [
  { value: "auto", label: "Automatisch (DE/EN)" },
  { value: "de", label: "Nur Deutsch" },
  { value: "en", label: "Nur Englisch" },
] as const;

export const ASSISTANT_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Aktiv", color: "var(--color-success)" },
  inactive: { label: "Inaktiv", color: "var(--color-muted)" },
  paused: { label: "Pausiert", color: "var(--color-warning)" },
};

export const CALL_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  ringing: { label: "Klingelt", color: "var(--color-accent)" },
  in_progress: { label: "Aktiv", color: "var(--color-success)" },
  completed: { label: "Abgeschlossen", color: "var(--color-success)" },
  failed: { label: "Fehlgeschlagen", color: "var(--color-danger)" },
  missed: { label: "Verpasst", color: "var(--color-warning)" },
  voicemail: { label: "Voicemail", color: "var(--color-muted)" },
};

export const PHONE_NUMBER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Ausstehend", color: "var(--color-warning)" },
  active: { label: "Aktiv", color: "var(--color-success)" },
  inactive: { label: "Inaktiv", color: "var(--color-muted)" },
  failed: { label: "Fehlgeschlagen", color: "var(--color-danger)" },
};
