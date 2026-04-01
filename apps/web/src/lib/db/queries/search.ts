import { createServiceClient, DEFAULT_ORG_ID } from "../supabase";
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
  const db = createServiceClient();
  const { data, error } = await db.rpc("search_chunks", {
    p_org_id: DEFAULT_ORG_ID,
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

  const db = createServiceClient();
  const { data, error } = await db.rpc("hybrid_search_chunks", {
    p_org_id: DEFAULT_ORG_ID,
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

  const db = createServiceClient();
  const { data, error } = await db.rpc("hybrid_search_boosted", {
    p_org_id: DEFAULT_ORG_ID,
    p_query: query,
    p_embedding: JSON.stringify(embedding),
    p_boost_source_ids: boostSourceIds,
    p_boost_factor: 1.5,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ChunkSearchResult[];
}

// Direct chunk retrieval by source IDs (fallback when search finds nothing)
export async function chunksBySourceIds(
  sourceIds: string[],
  limit = 20,
): Promise<ChunkSearchResult[]> {
  if (sourceIds.length === 0) return [];

  const db = createServiceClient();
  const { data, error } = await db
    .from("content_chunks")
    .select("id, source_id, chunk_index, chunk_text, sources!inner(title, source_type)")
    .in("source_id", sourceIds)
    .eq("organization_id", DEFAULT_ORG_ID)
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
