import { createServiceClient, DEFAULT_ORG_ID } from "../supabase";

export type Chunk = {
  id: string;
  source_id: string;
  chunk_index: number;
  chunk_text: string;
  token_count: number | null;
  char_start: number | null;
  char_end: number | null;
  created_at: string;
};

export async function listChunksBySource(sourceId: string): Promise<Chunk[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("content_chunks")
    .select("id, source_id, chunk_index, chunk_text, token_count, char_start, char_end, created_at")
    .eq("source_id", sourceId)
    .order("chunk_index");

  if (error) throw error;
  return data ?? [];
}
