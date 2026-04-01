import { createServiceClient, DEFAULT_ORG_ID } from "../supabase";

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
