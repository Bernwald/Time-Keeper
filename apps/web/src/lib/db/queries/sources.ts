import { createServiceClient, DEFAULT_ORG_ID } from "../supabase";

export type Source = {
  id: string;
  title: string;
  description: string | null;
  source_type: string;
  status: string;
  word_count: number | null;
  raw_text: string | null;
  storage_path: string | null;
  original_filename: string | null;
  created_at: string;
  updated_at: string;
};

export async function listSources(): Promise<Source[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("sources")
    .select("id, title, description, source_type, status, word_count, raw_text, storage_path, original_filename, created_at, updated_at")
    .eq("organization_id", DEFAULT_ORG_ID)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getSourceById(id: string): Promise<Source | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("sources")
    .select("*")
    .eq("id", id)
    .eq("organization_id", DEFAULT_ORG_ID)
    .single();

  if (error) return null;
  return data;
}
