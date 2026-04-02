import { listTags } from "@/lib/db/queries/tags";
import { createTag, deleteTag } from "@/app/actions";
import { card, btn, input, page, styles } from "@/components/ui/table-classes";

export const dynamic = "force-dynamic";

const PRESET_COLORS = [
  "#0d9488", "#2563eb", "#d97706", "#dc2626",
  "#7c3aed", "#059669", "#db2777", "#4f46e5",
];

export default async function AdminTagsPage() {
  const tags = await listTags();

  const grouped: Record<string, typeof tags> = {};
  for (const tag of tags) {
    const key = tag.category || "Allgemein";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tag);
  }

  return (
    <div className={page.wrapper}>
      <div className={`${page.header} animate-fade-in`}>
        <h1 className="text-2xl md:text-3xl font-semibold" style={styles.title}>
          Tag-Verwaltung
        </h1>
        <p className="text-sm" style={styles.muted}>
          {tags.length} {tags.length === 1 ? "Tag" : "Tags"} definiert
        </p>
      </div>

      {/* Create new tag */}
      <form
        action={createTag}
        className={`${card.base} flex flex-col gap-4 animate-slide-up`}
        style={styles.panel}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
          Neuer Tag
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Name *
            </label>
            <input
              name="name"
              required
              placeholder="z.B. SaaS, Enterprise, Prio-Hoch"
              className={input.base}
              style={styles.input}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Kategorie
            </label>
            <input
              name="category"
              placeholder="z.B. Branche, Status, Prioritaet"
              className={input.base}
              style={styles.input}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={input.label} style={{ color: "var(--color-text)" }}>
              Farbe
            </label>
            <div className="flex items-center gap-2">
              <input
                name="color"
                type="color"
                defaultValue="#0d9488"
                className="w-10 h-10 rounded-lg border-0 cursor-pointer min-h-[44px]"
              />
              <div className="flex gap-1 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="w-6 h-6 rounded-full border-2 border-transparent hover:border-gray-300 transition-all"
                    style={{ background: c }}
                    onClick={undefined}
                    aria-label={`Farbe ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div>
          <button type="submit" className={btn.primary} style={styles.accent}>
            Tag erstellen
          </button>
        </div>
      </form>

      {/* Existing tags grouped */}
      {Object.entries(grouped).map(([category, categoryTags]) => (
        <div key={category} className="flex flex-col gap-2 animate-fade-in">
          <h2 className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
            {category}
          </h2>
          <div className="flex flex-wrap gap-2">
            {categoryTags.map((tag) => {
              const deleteAction = deleteTag.bind(null, tag.id);
              return (
                <div
                  key={tag.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
                  style={{
                    background: `${tag.color || "var(--color-accent)"}18`,
                    color: tag.color || "var(--color-accent)",
                  }}
                >
                  {tag.name}
                  <form action={deleteAction} className="inline">
                    <button
                      type="submit"
                      className="hover:opacity-70 text-xs min-w-[20px] min-h-[20px] flex items-center justify-center"
                      aria-label={`Tag ${tag.name} loeschen`}
                    >
                      ×
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {tags.length === 0 && (
        <div
          className={`${card.base} flex flex-col items-center gap-3 py-12 text-center animate-scale-in`}
          style={styles.panel}
        >
          <p className="text-sm" style={styles.muted}>
            Noch keine Tags vorhanden. Erstelle deinen ersten Tag oben.
          </p>
        </div>
      )}
    </div>
  );
}
