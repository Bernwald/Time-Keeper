// Design token–based class constants for cards and tables.
// All layout components MUST use these — no inline ad-hoc values.

export const card = {
  base: "rounded-xl p-5",
  hover: "rounded-xl p-5 transition-shadow hover:shadow-md",
  row: "flex items-center gap-3 min-h-[44px] px-4 rounded-xl",
} as const;

export const badge = {
  base: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
  neutral: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
  accent: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
  danger: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
} as const;

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 px-4 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 min-h-[44px]",
  ghost:
    "inline-flex items-center justify-center gap-2 px-4 rounded-xl font-medium text-sm transition-colors min-h-[44px]",
  danger:
    "inline-flex items-center justify-center gap-2 px-4 rounded-xl font-medium text-sm transition-opacity hover:opacity-80 min-h-[44px]",
} as const;

export const input = {
  base: "w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors min-h-[44px]",
  textarea: "w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors resize-none",
} as const;

export const table = {
  wrapper: "w-full overflow-x-auto",
  table: "w-full text-sm border-collapse",
  th: "text-left px-4 py-3 font-medium text-xs uppercase tracking-wide",
  td: "px-4 py-3 border-t",
  tr: "hover:bg-[var(--color-accent-soft)] transition-colors",
} as const;
