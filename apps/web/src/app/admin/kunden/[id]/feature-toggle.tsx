"use client";

import { useTransition } from "react";
import { toggleFeature, resetFeature } from "../../actions";
import type { AdminOrgFeature } from "@/lib/db/queries/admin";

type Props = {
  orgId: string;
  feature: AdminOrgFeature;
};

export function FeatureToggle({ orgId, feature }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(() => {
      toggleFeature(orgId, feature.feature_key, !feature.enabled);
    });
  }

  function handleReset() {
    startTransition(() => {
      resetFeature(orgId, feature.feature_key);
    });
  }

  return (
    <li
      className="flex items-center justify-between min-h-[44px] px-3 rounded-lg"
      style={{
        background: "var(--color-bg)",
        opacity: isPending ? 0.6 : 1,
      }}
    >
      <div className="flex flex-col">
        <span className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
          {feature.name}
        </span>
        {feature.description && (
          <span className="text-xs" style={{ color: "var(--color-muted)" }}>
            {feature.description}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {feature.is_core && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--color-bg-elevated)", color: "var(--color-muted)" }}>
            Kern
          </span>
        )}

        {feature.has_override && (
          <button
            onClick={handleReset}
            disabled={isPending}
            className="text-xs px-2 py-1 rounded"
            style={{ color: "var(--color-muted)" }}
            title="Override entfernen (Kern-Standard wiederherstellen)"
          >
            Reset
          </button>
        )}

        <button
          onClick={handleToggle}
          disabled={isPending}
          className="min-w-[44px] min-h-[28px] rounded-full relative transition-colors"
          style={{
            background: feature.enabled ? "var(--color-accent)" : "var(--color-line)",
          }}
        >
          <span
            className="absolute top-0.5 w-6 h-6 rounded-full shadow-sm transition-all" style={{ background: "var(--color-panel)" }}
            style={{
              left: feature.enabled ? "calc(100% - 1.625rem)" : "0.125rem",
            }}
          />
        </button>
      </div>
    </li>
  );
}
