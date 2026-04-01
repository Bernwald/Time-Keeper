export const statusOptions = {
  companies: ["active", "prospect", "inactive"],
  contacts: ["active", "inactive"],
  projects: ["discovery", "active", "won", "paused"],
  interactions: ["meeting", "call", "email", "note"],
  tasks: ["todo", "in_progress", "blocked", "done"],
  documents: ["draft", "active", "archived"]
} as const;
