"use client";

import { useFormStatus } from "react-dom";
import { btn, styles } from "@/components/ui/table-classes";

export function SubmitButton({
  label = "Speichern",
  pendingLabel = "Speichern...",
  variant = "primary",
}: {
  label?: string;
  pendingLabel?: string;
  variant?: "primary" | "danger";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={variant === "danger" ? btn.danger : btn.primary}
      style={{
        ...(variant === "danger" ? styles.danger : styles.accent),
        opacity: pending ? 0.7 : 1,
        cursor: pending ? "wait" : "pointer",
      }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
