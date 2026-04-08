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
};

export async function fullTextSearch(query: string, limit = 10): Promise<ChunkSearchResult[]> {
  if (!query.trim()) return [];
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db.rpc("search_chunks", {
    p_org_id: orgId,
    p_query: query,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ChunkSearchResult[];
}

export async function hybridSearch(query: string, limit = 10): Promise<ChunkSearchResult[]> {
  if (!query.trim()) return [];

  const embedding = await embedText(query);

  // Fall back to FTS if no embedding key available
  if (!embedding) return fullTextSearch(query, limit);

  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db.rpc("hybrid_search_chunks", {
    p_org_id: orgId,
    p_query: query,
    p_embedding: JSON.stringify(embedding),
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ChunkSearchResult[];
}

export async function boostedHybridSearch(
  query: string,
  boostSourceIds: string[],
  limit = 10,
): Promise<ChunkSearchResult[]> {
  if (!query.trim()) return [];

  const embedding = await embedText(query);

  // Fall back to FTS if no embedding key available
  if (!embedding) return fullTextSearch(query, limit);

  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db.rpc("hybrid_search_boosted", {
    p_org_id: orgId,
    p_query: query,
    p_embedding: JSON.stringify(embedding),
    p_boost_source_ids: boostSourceIds,
    p_boost_factor: 1.5,
    p_limit: limit,
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
  limit = 8,
): Promise<ChunkSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const orgId = await requireOrgId();
  const db = await createUserClient();
  const like = `%${trimmed}%`;

  // For listing-questions ("alle Kontakte", "vertriebskontakte") we want to
  // return everything, not just name-matches. Heuristic: if the query mentions
  // "kontakt" / "firma" / "projekt", return the top rows by recency too.
  const lower = trimmed.toLowerCase();
  const wantsAllContacts = /kontakt|vertrieb|ansprech|lead/i.test(lower);
  const wantsAllCompanies = /firma|unternehmen|kunde|account/i.test(lower);
  const wantsAllProjects = /projekt/i.test(lower);

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

// Direct chunk retrieval by source IDs (fallback when search finds nothing)
export async function chunksBySourceIds(
  sourceIds: string[],
  limit = 20,
): Promise<ChunkSearchResult[]> {
  if (sourceIds.length === 0) return [];

  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("content_chunks")
    .select("id, source_id, chunk_index, chunk_text, sources!inner(title, source_type)")
    .in("source_id", sourceIds)
    .eq("organization_id", orgId)
    .order("source_id")
    .order("chunk_index")
    .limit(limit);

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
