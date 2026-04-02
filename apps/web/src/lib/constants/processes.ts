// Shared constants for process management — safe for client and server use

export const PROCESS_CATEGORIES = [
  { value: "onboarding", label: "Onboarding" },
  { value: "integration", label: "Integration" },
  { value: "review", label: "Review" },
  { value: "custom", label: "Individuell" },
] as const;

export const RESPONSIBLE_ROLES = [
  { value: "consultant", label: "Berater" },
  { value: "client", label: "Kunde" },
  { value: "admin", label: "Admin" },
] as const;
