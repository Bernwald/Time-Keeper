"use client";

import { useState, useTransition } from "react";
import { backfillEmbeddings } from "@/app/actions";
import { btn, styles } from "@/components/ui/table-classes";

export function BackfillButton({ sourceId }: { sourceId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await backfillEmbeddings(sourceId);
      setResult(`${res.updated} Chunks mit Embeddings aktualisiert`);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className={btn.secondary}
        style={{
          background: "var(--color-bg-elevated)",
          color: "var(--color-text)",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Embeddings werden generiert …" : "Embeddings generieren"}
      </button>
      {result && (
        <span className="text-xs" style={styles.muted}>{result}</span>
      )}
    </div>
  );
}
