"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { input, btn } from "@/components/ui/table-classes";

export function SearchForm({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Begriff suchen …"
        className={input.base}
        style={{
          borderColor: "var(--color-line)",
          background: "var(--color-panel)",
          color: "var(--color-text)",
          flex: 1,
        }}
        autoFocus
      />
      <button
        type="submit"
        className={btn.primary}
        style={{ background: "var(--color-accent)", color: "#fff" }}
      >
        Suchen
      </button>
    </form>
  );
}
