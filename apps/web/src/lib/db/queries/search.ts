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
