import { createUserClient } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";

export type ResolvedEntity = {
  type: "company" | "contact" | "project";
  id: string;
  name: string;
};

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
      db
        .from("source_links")
        .select("source_id")
        .eq("organization_id", orgId)
        .eq("linked_type", type)
        .in("linked_id", ids)
        .then((res) => ({ data: res.data as { source_id: string }[] | null })),
    );
  }

  const results = await Promise.all(queries);
  const sourceIds = new Set<string>();
  for (const r of results) {
    for (const row of r.data ?? []) sourceIds.add(row.source_id);
  }

  return [...sourceIds];
}
