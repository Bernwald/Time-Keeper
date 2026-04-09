"use client";

import { useTransition } from "react";
import {
  retrySource,
  deleteSource,
  restoreSource,
  purgeSource,
  reconcileConnector,
} from "./actions";

type IconKind = "retry" | "delete" | "restore" | "purge" | "reconcile";

const ICON: Record<IconKind, string> = {
  retry: "↻",
  delete: "🗑",
  restore: "↶",
  purge: "✕",
  reconcile: "✓",
};

const LABEL: Record<IconKind, string> = {
  retry: "Erneut verarbeiten",
  delete: "In Papierkorb verschieben",
  restore: "Wiederherstellen",
  purge: "Endgültig löschen",
  reconcile: "Aufräumen",
};

function ActionButton(props: {
  kind: IconKind;
  onAction: () => Promise<void>;
  confirm?: string;
  danger?: boolean;
  withLabel?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      title={LABEL[props.kind]}
      aria-label={LABEL[props.kind]}
      disabled={pending}
      onClick={() => {
        if (props.confirm && !confirm(props.confirm)) return;
        startTransition(async () => {
          try {
            await props.onAction();
          } catch (err) {
            console.error("[action]", props.kind, err);
          }
        });
      }}
      className="inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] px-2 rounded-[var(--radius-md)] text-xs flex-shrink-0"
      style={{
        background: props.danger
          ? "var(--color-danger-soft)"
          : "var(--color-bg-elevated)",
        color: props.danger ? "var(--color-danger)" : "var(--color-text)",
        opacity: pending ? 0.5 : 1,
      }}
    >
      <span aria-hidden>{pending ? "…" : ICON[props.kind]}</span>
      {props.withLabel && <span>{LABEL[props.kind]}</span>}
    </button>
  );
}

export function RetryButton({ sourceId }: { sourceId: string }) {
  return <ActionButton kind="retry" onAction={() => retrySource(sourceId)} />;
}

export function DeleteButton({ sourceId }: { sourceId: string }) {
  return (
    <ActionButton
      kind="delete"
      onAction={() => deleteSource(sourceId)}
    />
  );
}

export function RestoreButton({ sourceId }: { sourceId: string }) {
  return (
    <ActionButton
      kind="restore"
      onAction={() => restoreSource(sourceId)}
      withLabel
    />
  );
}

export function PurgeButton({ sourceId }: { sourceId: string }) {
  return (
    <ActionButton
      kind="purge"
      danger
      onAction={() => purgeSource(sourceId)}
      confirm="Diese Datei endgültig löschen? Das kann nicht rückgängig gemacht werden."
      withLabel
    />
  );
}

export function ReconcileButton({
  providerId,
}: {
  providerId: "google_drive" | "sharepoint";
}) {
  return (
    <ActionButton
      kind="reconcile"
      onAction={() => reconcileConnector(providerId)}
      confirm="Alle Dateien entfernen, die nicht mehr in der Quelle existieren?"
      withLabel
    />
  );
}
