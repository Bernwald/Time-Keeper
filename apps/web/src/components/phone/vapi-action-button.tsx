"use client";

import { useActionState } from "react";
import { btn } from "@/components/ui/table-classes";

type ActionResult = { ok: boolean; error?: string } | null;

export function VapiActionButton({
  action,
  label,
  pendingLabel,
}: {
  action: () => Promise<{ ok: boolean; error?: string }>;
  label: string;
  pendingLabel: string;
}) {
  const [state, formAction, isPending] = useActionState<ActionResult>(
    async () => {
      const result = await action();
      return result;
    },
    null,
  );

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={isPending}
        className={btn.primary}
        style={{
          background: isPending ? "var(--color-muted)" : "var(--color-accent)",
          color: "var(--color-bg)",
          opacity: isPending ? 0.7 : 1,
          cursor: isPending ? "wait" : "pointer",
        }}
      >
        {isPending ? pendingLabel : label}
      </button>

      {state?.error && (
        <div
          className="mt-3 p-3 rounded-lg text-xs"
          style={{
            background: "var(--color-danger-soft, rgba(239,68,68,0.1))",
            color: "var(--color-danger, #ef4444)",
            border: "1px solid var(--color-danger, #ef4444)",
          }}
        >
          {state.error}
        </div>
      )}

      {state?.ok && (
        <div
          className="mt-3 p-3 rounded-lg text-xs"
          style={{
            background: "var(--color-success-soft, rgba(34,197,94,0.1))",
            color: "var(--color-success, #22c55e)",
            border: "1px solid var(--color-success, #22c55e)",
          }}
        >
          Erfolgreich!
        </div>
      )}
    </form>
  );
}
