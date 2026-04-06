import { createUserClient } from "../supabase-server";
import { requireOrgId } from "../org-context";

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

const DEFAULT_LIMIT = 200;

export async function listSources(options?: { limit?: number }): Promise<Source[]> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("sources")
    .select("id, title, description, source_type, status, word_count, raw_text, storage_path, original_filename, created_at, updated_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(options?.limit ?? DEFAULT_LIMIT);

  if (error) throw error;
  return data ?? [];
}

export async function countReadySources(): Promise<number> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { count } = await db
    .from("sources")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "ready");
  return count ?? 0;
}

export async function getSourceById(id: string): Promise<Source | null> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("sources")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (error) return null;
  return data;
}
