// ─── Design token–based class constants ─────────────────────────────
// All layout components MUST use these. No inline ad-hoc values.

export const card = {
  base: "rounded-[var(--radius-card)] p-4 md:p-5",
  hover:
    "rounded-[var(--radius-card)] p-4 md:p-5 transition-all hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5",
  interactive:
    "rounded-[var(--radius-card)] p-4 md:p-5 transition-all hover:shadow-[var(--shadow-card)] hover:-translate-y-0.5 cursor-pointer",
  flat: "rounded-[var(--radius-card)] p-4 md:p-5 border",
} as const;

export const badge = {
  base: "inline-flex items-center px-2 py-0.5 rounded-[var(--radius-xs)] text-xs font-medium leading-tight",
  pill: "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium leading-tight",
  dot: "inline-flex items-center gap-1.5 text-xs font-medium leading-tight",
} as const;

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 px-5 rounded-[var(--radius-card)] font-medium text-sm transition-all min-h-[44px] min-w-[44px] hover:shadow-[var(--shadow-sm)] active:scale-[0.97]",
  secondary:
    "inline-flex items-center justify-center gap-2 px-5 rounded-[var(--radius-card)] font-medium text-sm transition-all min-h-[44px] min-w-[44px] hover:shadow-[var(--shadow-xs)] active:scale-[0.97]",
  ghost:
    "inline-flex items-center justify-center gap-2 px-4 rounded-[var(--radius-card)] font-medium text-sm transition-all min-h-[44px] min-w-[44px] active:scale-[0.97]",
  danger:
    "inline-flex items-center justify-center gap-2 px-5 rounded-[var(--radius-card)] font-medium text-sm transition-all min-h-[44px] min-w-[44px] active:scale-[0.97]",
  icon:
    "inline-flex items-center justify-center rounded-[var(--radius-sm)] transition-all min-h-[44px] min-w-[44px] active:scale-[0.95]",
} as const;

export const input = {
  base: "w-full rounded-[var(--radius-md)] border px-3.5 py-2.5 text-sm outline-none transition-all min-h-[44px] placeholder:text-[var(--color-placeholder)]",
  textarea:
    "w-full rounded-[var(--radius-md)] border px-3.5 py-2.5 text-sm outline-none transition-all resize-none placeholder:text-[var(--color-placeholder)]",
  label: "text-sm font-medium",
  hint: "text-xs mt-1",
} as const;

export const table = {
  wrapper: "w-full overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0",
  table: "w-full text-sm border-collapse",
  th: "text-left px-4 py-3 font-medium text-[11px] uppercase tracking-wide",
  td: "px-4 py-3",
  tr: "border-t transition-colors",
} as const;

export const page = {
  wrapper: "flex flex-col gap-5 md:gap-6 p-4 md:p-6 lg:p-8",
  narrow: "flex flex-col gap-5 md:gap-6 p-4 md:p-6 lg:p-8 max-w-2xl",
  header: "flex flex-col gap-1",
  headerRow: "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
} as const;

// Style maps for consistent inline styles
export const styles = {
  panel: {
    background: "var(--color-panel)",
    border: "1px solid var(--color-line)",
  },
  panelStrong: {
    background: "var(--color-panel-strong)",
    border: "1px solid var(--color-line)",
  },
  input: {
    borderColor: "var(--color-line)",
    background: "var(--color-panel-strong)",
    color: "var(--color-text)",
  },
  title: {
    fontFamily: "var(--font-display)",
    color: "var(--color-text)",
  },
  muted: {
    color: "var(--color-muted)",
  },
  accent: {
    background: "var(--color-accent)",
    color: "var(--color-accent-text)",
  },
  accentSoft: {
    background: "var(--color-accent-soft)",
    color: "var(--color-accent)",
  },
  danger: {
    background: "var(--color-danger-soft)",
    color: "var(--color-danger)",
  },
  warning: {
    background: "var(--color-warning-soft)",
    color: "var(--color-warning)",
  },
} as const;
