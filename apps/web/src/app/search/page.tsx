import { fullTextSearch } from "@/lib/db/queries/search";
import { SearchForm } from "./search-form";
import { card, badge } from "@/components/ui/table-classes";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? await fullTextSearch(query, 20) : [];

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8 max-w-3xl">
      <div>
        <h1
          className="text-2xl font-semibold leading-tight"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Suche
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
          Volltext-Suche über alle Wissensquellen.
        </p>
      </div>

      <SearchForm initialQuery={query} />

      {query && (
        <div className="flex flex-col gap-3">
          <p className="text-sm" style={{ color: "var(--color-muted)" }}>
            {results.length === 0
              ? `Keine Ergebnisse für „${query}"`
              : `${results.length} ${results.length === 1 ? "Treffer" : "Treffer"} für „${query}"`}
          </p>

          {results.map((result) => (
            <div
              key={result.id}
              className={card.base}
              style={{
                background: "var(--color-panel)",
                border: "1px solid var(--color-line)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span
                  className={badge.base}
                  style={{
                    background: "var(--color-accent-soft)",
                    color: "var(--color-accent)",
                  }}
                >
                  {result.source_title}
                </span>
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>
                  {result.source_type} · Chunk #{result.chunk_index + 1}
                </span>
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--color-text)" }}
              >
                {result.chunk_text.slice(0, 400)}
                {result.chunk_text.length > 400 ? " …" : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
