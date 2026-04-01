"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { input, btn, styles } from "@/components/ui/table-classes";

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
    <form onSubmit={handleSubmit} className="flex gap-2 animate-fade-in">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Begriff suchen …"
        className={input.base}
        style={{ ...styles.input, flex: 1, borderColor: "var(--color-line-soft)" }}
        autoFocus
      />
      <button type="submit" className={btn.primary} style={styles.accent}>
        Suchen
      </button>
    </form>
  );
}
