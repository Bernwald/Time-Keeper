import { createUserClient } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";

export type ResolvedEntity = {
  type: "company" | "contact" | "project";
  id: string;
  name: string;
};

// Very small German stopword list. The goal is NOT full NLP — we just want
// to strip filler so "gib mir alle Pilot Kunden" reduces to "pilot kunden"
// before we match it against tag names.
const TAG_STOPWORDS = new Set([
  "der", "die", "das", "den", "dem", "des",
  "ein", "eine", "einen", "einer", "einem", "eines",
  "und", "oder", "aber", "mit", "von", "zum", "zur",
  "ich", "mir", "mich", "du", "dir", "dich", "wir",
  "gib", "zeig", "zeige", "liste", "sag", "sage",
  "bitte", "danke", "mal",
  "alle", "welche", "welcher", "welches", "welchen",
  "ist", "sind", "war", "sein", "haben", "hat",
  "wie", "viele", "was", "wer", "wen", "wem", "wo",
  "auf", "in", "bei", "an", "am", "im",
  "nach", "vor", "seit", "über", "unter",
  "alle", "jede", "jeder", "jedes",
]);

// Hard cap for in-process substring matching — protects the chat hot path
// from loading tens of thousands of rows on large tenants. A follow-up
// migration should move this into a Postgres function with trigram search.
const RESOLVE_LIMIT = 500;

/**
 * Find companies / contacts / projects whose name appears in the query.
 * Does three scoped, limited lookups in parallel.
 */
export async function resolveEntities(query: string): Promise<ResolvedEntity[]> {
  const lower = query.toLowerCase();
  if (!lower.trim()) return [];

  const orgId = await requireOrgId();
  const db = await createUserClient();

  const [companiesRes, contactsRes, projectsRes] = await Promise.all([
    db
      .from("companies")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name")
      .limit(RESOLVE_LIMIT),
    db
      .from("contacts")
      .select("id, first_name, last_name")
      .eq("organization_id", orgId)
      .order("last_name")
      .limit(RESOLVE_LIMIT),
    db
      .from("projects")
      .select("id, name")
      .eq("organization_id", orgId)
      .order("name")
      .limit(RESOLVE_LIMIT),
  ]);

  const matches: ResolvedEntity[] = [];

  for (const c of companiesRes.data ?? []) {
    if (c.name && lower.includes(c.name.toLowerCase())) {
      matches.push({ type: "company", id: c.id, name: c.name });
    }
  }

  for (const c of contactsRes.data ?? []) {
    const fullName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    if (
      (fullName && lower.includes(fullName.toLowerCase())) ||
      (c.last_name && lower.includes(c.last_name.toLowerCase()))
    ) {
      matches.push({ type: "contact", id: c.id, name: fullName });
    }
  }

  for (const p of projectsRes.data ?? []) {
    if (p.name && lower.includes(p.name.toLowerCase())) {
      matches.push({ type: "project", id: p.id, name: p.name });
    }
  }

  return matches;
}

/**
 * Find tag names that appear as tokens in the query. Used to boost entities
 * that are tagged with "Pilot" when the user asks about "Pilot Kunden", etc.
 *
 * Case-insensitive; matches whole-word or substring (so the tag "Pilot" also
 * fires for "Pilotkunde" and "Pilotprojekt"). Returns the matching tag rows.
 */
export async function findMatchingTags(query: string): Promise<
  Array<{ id: string; name: string }>
> {
  const lower = query.toLowerCase().trim();
  if (!lower) return [];

  // Tokenize roughly: split on whitespace + punctuation, strip stopwords.
  const tokens = lower
    .split(/[\s.,;:!?()/\\"'„"»«]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !TAG_STOPWORDS.has(t));
  if (tokens.length === 0) return [];

  const orgId = await requireOrgId();
  const db = await createUserClient();

  // Pull all tags of the org (usually small — tens to low hundreds) and match
  // in JS. A 500-row hard cap protects pathological tenants.
  const { data: tags } = await db
    .from("tags")
    .select("id, name")
    .eq("organization_id", orgId)
    .limit(500);

  const matches: Array<{ id: string; name: string }> = [];
  for (const tag of (tags ?? []) as Array<{ id: string; name: string }>) {
    const tagLower = tag.name.toLowerCase();
    for (const token of tokens) {
      // Token appears IN the tag (e.g. token "pilot" matches tag "Pilotprojekt")
      // OR the tag appears in the token (e.g. tag "Pilot" in token "pilotkontakte").
      if (tagLower.includes(token) || token.includes(tagLower)) {
        matches.push(tag);
        break;
      }
    }
  }
  return matches;
}

/**
 * Collect all source IDs whose linked entity is tagged with one of the given
 * tag IDs. Returns the source IDs so they can feed the boost list.
 */
export async function getSourceIdsForTags(tagIds: string[]): Promise<string[]> {
  if (tagIds.length === 0) return [];

  const orgId = await requireOrgId();
  const db = await createUserClient();

  const { data } = await db
    .from("entity_tags")
    .select("entity_type, entity_id")
    .eq("organization_id", orgId)
    .in("tag_id", tagIds);

  const byType: Record<ResolvedEntity["type"], string[]> = {
    company: [],
    contact: [],
    project: [],
  };
  for (const row of (data ?? []) as Array<{ entity_type: string; entity_id: string }>) {
    if (row.entity_type === "company" || row.entity_type === "contact" || row.entity_type === "project") {
      byType[row.entity_type].push(row.entity_id);
    }
  }

  const queries: Array<Promise<{ data: { source_id: string }[] | null }>> = [];
  for (const type of ["company", "contact", "project"] as const) {
    const ids = byType[type];
    if (ids.length === 0) continue;
    queries.push(
      Promise.resolve(
        db
          .from("source_links")
          .select("source_id")
          .eq("organization_id", orgId)
          .eq("linked_type", type)
          .in("linked_id", ids),
      ).then((res) => ({ data: res.data as { source_id: string }[] | null })),
    );
  }

  const results = await Promise.all(queries);
  const sourceIds = new Set<string>();
  for (const r of results) {
    for (const row of r.data ?? []) sourceIds.add(row.source_id);
  }
  return [...sourceIds];
}

/**
 * Collect all source IDs linked to the given entities — in a SINGLE query.
 * Previously this was N+1 (one query per entity in a loop).
 */
export async function getBoostSourceIds(entities: ResolvedEntity[]): Promise<string[]> {
  if (entities.length === 0) return [];

  const orgId = await requireOrgId();
  const db = await createUserClient();

  // Group entity IDs by type so we can filter correctly on the join table.
  const byType: Record<ResolvedEntity["type"], string[]> = {
    company: [],
    contact: [],
    project: [],
  };
  for (const e of entities) byType[e.type].push(e.id);

  // Build an OR-filter across type+id tuples. For each type we do a single
  // `.in(linked_id, [...])` restricted to that linked_type, then union in JS.
  const queries: Array<Promise<{ data: { source_id: string }[] | null }>> = [];
  for (const type of ["company", "contact", "project"] as const) {
    const ids = byType[type];
    if (ids.length === 0) continue;
    queries.push(
      Promise.resolve(
        db
          .from("source_links")
          .select("source_id")
          .eq("organization_id", orgId)
          .eq("linked_type", type)
          .in("linked_id", ids),
      ).then((res) => ({ data: res.data as { source_id: string }[] | null })),
    );
  }

  const results = await Promise.all(queries);
  const sourceIds = new Set<string>();
  for (const r of results) {
    for (const row of r.data ?? []) sourceIds.add(row.source_id);
  }

  return [...sourceIds];
}
