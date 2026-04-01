import { fullTextSearch } from "@/lib/db/queries/search";
import { SearchForm } from "./search-form";
import { card, badge, page, styles } from "@/components/ui/table-classes";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query ? await fullTextSearch(query, 20) : [];

  return (
    <div className={page.narrow}>
      <div className="animate-fade-in">
        <h1 className="text-2xl md:text-3xl font-semibold" style={styles.title}>
          Suche
        </h1>
        <p className="text-sm mt-0.5" style={styles.muted}>
          Durchsuche alle Wissensquellen per Volltext.
        </p>
      </div>

      <SearchForm initialQuery={query} />

      {query && (
        <div className="flex flex-col gap-3">
          <p className="text-sm animate-fade-in" style={styles.muted}>
            {results.length === 0
              ? `Keine Ergebnisse für „${query}"`
              : `${results.length} Treffer für „${query}"`}
          </p>

          <div className="flex flex-col gap-2.5 stagger-children">
            {results.map((r) => (
              <div key={r.id} className={card.flat} style={styles.panel}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={badge.pill} style={styles.accentSoft}>
                    {r.source_title}
                  </span>
                  <span className="text-[11px]" style={styles.muted}>
                    {r.source_type} · Chunk #{r.chunk_index + 1}
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>
                  {r.chunk_text.slice(0, 400)}{r.chunk_text.length > 400 ? " …" : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
