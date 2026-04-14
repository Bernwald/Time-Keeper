import { createUserClient } from "../supabase-server";
import { requireOrgId } from "../org-context";
import { embedText } from "@/lib/ai/embeddings";

export type ChunkSearchResult = {
  id: string;
  source_id: string;
  chunk_index: number;
  chunk_text: string;
  source_title: string;
  source_type: string;
  rank: number;
  /**
   * Diagnostic tag — which retrieval arm surfaced this chunk. Set by the
   * caller during merge, not by the SQL functions. Used by the admin
   * debug panel to show *why* a chunk is in the context window.
   */
  retrieved_via?: "hybrid" | "boost" | "operational" | "listing" | "fallback";
  /**
   * Per-sheet count of cells that carry an Excel formula without a cached
   * value (populated during xlsx ingest → sources.metadata.formula_warnings).
   * Surfaced in the admin debug panel so the user knows which files need to
   * be opened in Excel + re-saved to recompute.
   */
  formula_warnings?: Record<string, number>;
};

/**
 * Batch-fetch `sources.metadata.formula_warnings` for all source_ids that
 * appear in `chunks`. Attaches the warnings in-place (returns a new array).
 * Missing or empty warnings leave the field undefined.
 */
export async function enrichChunksWithFormulaWarnings(
  chunks: ChunkSearchResult[],
): Promise<ChunkSearchResult[]> {
  if (chunks.length === 0) return chunks;
  const orgId = await requireOrgId();
  const db = await createUserClient();

  // Exclude pseudo-chunks from operational entities (contact/company/project)
  // — those source_ids don't live in the `sources` table.
  const sourceIds = Array.from(
    new Set(
      chunks
        .filter((c) => !["contact", "company", "project"].includes(c.source_type))
        .map((c) => c.source_id),
    ),
  );
  if (sourceIds.length === 0) return chunks;

  const { data } = await db
    .from("sources")
    .select("id, metadata")
    .eq("organization_id", orgId)
    .in("id", sourceIds);

  const warningsById = new Map<string, Record<string, number>>();
  for (const row of (data ?? []) as Array<{ id: string; metadata: Record<string, unknown> | null }>) {
    const fw = row.metadata?.formula_warnings as Record<string, number> | undefined;
    if (fw && typeof fw === "object" && Object.keys(fw).length > 0) {
      warningsById.set(row.id, fw);
    }
  }

  if (warningsById.size === 0) return chunks;
  return chunks.map((c) => {
    const fw = warningsById.get(c.source_id);
    return fw ? { ...c, formula_warnings: fw } : c;
  });
}

export async function fullTextSearch(query: string, limit = 10, userId?: string): Promise<ChunkSearchResult[]> {
  if (!query.trim()) return [];
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db.rpc("search_chunks", {
    p_org_id: orgId,
    p_query: query,
    p_limit: limit,
    p_user_id: userId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ChunkSearchResult[];
}

export async function hybridSearch(query: string, limit = 10, userId?: string): Promise<ChunkSearchResult[]> {
  if (!query.trim()) return [];

  const embedding = await embedText(query);

  // Fall back to FTS if no embedding key available
  if (!embedding) return fullTextSearch(query, limit, userId);

  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db.rpc("hybrid_search_chunks", {
    p_org_id: orgId,
    p_query: query,
    p_embedding: JSON.stringify(embedding),
    p_limit: limit,
    p_user_id: userId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ChunkSearchResult[];
}

export async function boostedHybridSearch(
  query: string,
  boostSourceIds: string[],
  limit = 10,
  userId?: string,
): Promise<ChunkSearchResult[]> {
  if (!query.trim()) return [];

  const embedding = await embedText(query);

  // Fall back to FTS if no embedding key available
  if (!embedding) return fullTextSearch(query, limit, userId);

  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db.rpc("hybrid_search_boosted", {
    p_org_id: orgId,
    p_query: query,
    p_embedding: JSON.stringify(embedding),
    p_boost_source_ids: boostSourceIds,
    p_boost_factor: 1.5,
    p_limit: limit,
    p_user_id: userId ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ChunkSearchResult[];
}

// Search operational entity tables (companies/contacts/projects) via ILIKE.
// Returns pseudo-chunks so they can be merged with the hybrid-search results.
// This guarantees the chat finds rows that live in operative tables and were
// never imported as `sources` (e.g. CRM data added directly).
export async function searchOperationalEntities(
  query: string,
  limit = 100,
  mode: "search" | "exhaustive" = "search",
): Promise<ChunkSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const orgId = await requireOrgId();
  const db = await createUserClient();
  const like = `%${trimmed}%`;

  // For listing-questions ("alle Kontakte", "vertriebskontakte") we want to
  // return everything, not just name-matches. In exhaustive mode (caller knows
  // it's a listing) we return all rows of all three types.
  const lower = trimmed.toLowerCase();
  const wantsAllContacts =
    mode === "exhaustive" || /kontakt|vertrieb|ansprech|lead|warm|kalt|lauwarm|hot|cold/i.test(lower);
  const wantsAllCompanies =
    mode === "exhaustive" || /firma|unternehmen|kunde|account/i.test(lower);
  const wantsAllProjects =
    mode === "exhaustive" || /projekt/i.test(lower);

  const [contactsRes, companiesRes, projectsRes] = await Promise.all([
    db
      .from("contacts")
      .select(
        "id, first_name, last_name, email, phone, role_title, status, notes, companies(name)",
      )
      .eq("organization_id", orgId)
      .or(
        wantsAllContacts
          ? "id.not.is.null"
          : `first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},role_title.ilike.${like},notes.ilike.${like}`,
      )
      .limit(limit),
    db
      .from("companies")
      .select("id, name, website, status, notes")
      .eq("organization_id", orgId)
      .or(
        wantsAllCompanies
          ? "id.not.is.null"
          : `name.ilike.${like},website.ilike.${like},notes.ilike.${like}`,
      )
      .limit(limit),
    db
      .from("projects")
      .select("id, name, status, description, companies(name)")
      .eq("organization_id", orgId)
      .or(
        wantsAllProjects
          ? "id.not.is.null"
          : `name.ilike.${like},description.ilike.${like}`,
      )
      .limit(limit),
  ]);

  const out: ChunkSearchResult[] = [];

  // Bulk-fetch tags for all returned entities so the LLM sees temperature
  // (warm/cold) and other categorical info that lives only in the tag system.
  const contactIds = ((contactsRes.data ?? []) as any[]).map((c) => c.id);
  const companyIds = ((companiesRes.data ?? []) as any[]).map((c) => c.id);
  const projectIds = ((projectsRes.data ?? []) as any[]).map((p) => p.id);
  const allEntityIds = [...contactIds, ...companyIds, ...projectIds];

  const tagsByEntity = new Map<string, string[]>();
  if (allEntityIds.length > 0) {
    const { data: tagRows } = await db
      .from("entity_tags")
      .select("entity_type, entity_id, tags(name)")
      .eq("organization_id", orgId)
      .in("entity_id", allEntityIds);
    for (const row of (tagRows ?? []) as any[]) {
      const key = `${row.entity_type}:${row.entity_id}`;
      const name = row.tags?.name;
      if (!name) continue;
      const arr = tagsByEntity.get(key) ?? [];
      arr.push(name);
      tagsByEntity.set(key, arr);
    }
  }

  const tagLine = (type: string, id: string): string | null => {
    const tags = tagsByEntity.get(`${type}:${id}`);
    return tags && tags.length > 0 ? `Tags: ${tags.join(", ")}` : null;
  };

  for (const c of (contactsRes.data ?? []) as any[]) {
    const fullName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
    const company = c.companies?.name ?? "";
    const text = [
      `Name: ${fullName}`,
      company && `Unternehmen: ${company}`,
      c.role_title && `Rolle: ${c.role_title}`,
      c.email && `E-Mail: ${c.email}`,
      c.phone && `Telefon: ${c.phone}`,
      c.status && `Status: ${c.status}`,
      tagLine("contact", c.id),
      c.notes && `Notizen: ${c.notes}`,
    ].filter(Boolean).join("\n");
    out.push({
      id: `contact:${c.id}`,
      source_id: c.id,
      chunk_index: 0,
      chunk_text: text,
      source_title: `Kontakt: ${fullName}`,
      source_type: "contact",
      rank: 0.9,
    });
  }

  for (const c of (companiesRes.data ?? []) as any[]) {
    const text = [
      `Unternehmen: ${c.name}`,
      c.website && `Website: ${c.website}`,
      c.status && `Status: ${c.status}`,
      tagLine("company", c.id),
      c.notes && `Notizen: ${c.notes}`,
    ].filter(Boolean).join("\n");
    out.push({
      id: `company:${c.id}`,
      source_id: c.id,
      chunk_index: 0,
      chunk_text: text,
      source_title: `Firma: ${c.name}`,
      source_type: "company",
      rank: 0.9,
    });
  }

  for (const p of (projectsRes.data ?? []) as any[]) {
    const company = p.companies?.name ?? "";
    const text = [
      `Projekt: ${p.name}`,
      company && `Kunde: ${company}`,
      p.status && `Status: ${p.status}`,
      tagLine("project", p.id),
      p.description && `Beschreibung: ${p.description}`,
    ].filter(Boolean).join("\n");
    out.push({
      id: `project:${p.id}`,
      source_id: p.id,
      chunk_index: 0,
      chunk_text: text,
      source_title: `Projekt: ${p.name}`,
      source_type: "project",
      rank: 0.9,
    });
  }

  return out;
}

// Exhaustive fetch of all chunks for sources of given types.
// Used for LISTING questions ("alle Kontakte", "wie viele warme ...") where
// relevance ranking would otherwise drop short entity-sources behind a single
// long transcript. Returns up to `limit` chunks, newest source first.
export async function listAllChunksByType(
  sourceTypes: string[],
  limit = 80,
  userId?: string,
): Promise<ChunkSearchResult[]> {
  if (sourceTypes.length === 0) return [];
  const orgId = await requireOrgId();
  const db = await createUserClient();

  let query = db
    .from("sources")
    .select("id, title, source_type, folder_id, created_at, content_chunks(id, chunk_index, chunk_text)")
    .eq("organization_id", orgId)
    .in("source_type", sourceTypes)
    .order("created_at", { ascending: false })
    .limit(limit);

  // Permission filtering: if userId provided, fetch accessible folder IDs
  // and filter sources to those without folder or in accessible folders
  if (userId) {
    const { data: accessibleFolders } = await db
      .from("source_folder_access")
      .select("folder_id, permission_group_members!inner(user_id)")
      .eq("permission_group_members.user_id", userId);

    const folderIds = (accessibleFolders ?? []).map((f: any) => f.folder_id);

    // Sources without folder_id are always visible; with folder_id only if accessible
    if (folderIds.length > 0) {
      query = query.or(`folder_id.is.null,folder_id.in.(${folderIds.join(",")})`);
    } else {
      query = query.is("folder_id", null);
    }
  }

  const { data } = await query;

  const out: ChunkSearchResult[] = [];
  for (const s of (data ?? []) as any[]) {
    for (const c of (s.content_chunks ?? []) as any[]) {
      out.push({
        id: c.id,
        source_id: s.id,
        chunk_index: c.chunk_index,
        chunk_text: c.chunk_text,
        source_title: s.title,
        source_type: s.source_type,
        rank: 1,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// Direct chunk retrieval by source IDs (fallback when search finds nothing)
export async function chunksBySourceIds(
  sourceIds: string[],
  limit = 20,
  userId?: string,
): Promise<ChunkSearchResult[]> {
  if (sourceIds.length === 0) return [];

  const orgId = await requireOrgId();
  const db = await createUserClient();

  let query = db
    .from("content_chunks")
    .select("id, source_id, chunk_index, chunk_text, sources!inner(title, source_type, folder_id)")
    .in("source_id", sourceIds)
    .eq("organization_id", orgId)
    .order("source_id")
    .order("chunk_index")
    .limit(limit);

  // Permission filtering at source level
  if (userId) {
    const { data: accessibleFolders } = await db
      .from("source_folder_access")
      .select("folder_id, permission_group_members!inner(user_id)")
      .eq("permission_group_members.user_id", userId);

    const folderIds = (accessibleFolders ?? []).map((f: any) => f.folder_id);

    if (folderIds.length > 0) {
      query = query.or(`folder_id.is.null,folder_id.in.(${folderIds.join(",")})`, { referencedTable: "sources" });
    } else {
      query = query.is("sources.folder_id" as any, null);
    }
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    source_id: row.source_id,
    chunk_index: row.chunk_index,
    chunk_text: row.chunk_text,
    source_title: row.sources.title,
    source_type: row.sources.source_type,
    rank: 1,
  }));
}
