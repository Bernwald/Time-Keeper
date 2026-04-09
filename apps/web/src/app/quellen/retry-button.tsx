"use client";

import { useTransition } from "react";
import { retrySource } from "./actions";

export function RetryButton({ sourceId }: { sourceId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title="Erneut verarbeiten"
      aria-label="Erneut verarbeiten"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            await retrySource(sourceId);
          } catch (err) {
            console.error("[retry]", err);
          }
        })
      }
      className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-[var(--radius-md)] text-xs flex-shrink-0"
      style={{
        background: "var(--color-bg-elevated)",
        color: "var(--color-text)",
        opacity: pending ? 0.5 : 1,
      }}
    >
      {pending ? "…" : "↻"}
    </button>
  );
}
