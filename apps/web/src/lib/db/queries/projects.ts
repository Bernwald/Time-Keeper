import { createServiceClient, DEFAULT_ORG_ID } from "../supabase";

export type Project = {
  id: string;
  company_id: string | null;
  name: string;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export async function listProjects(): Promise<Project[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .select("id, company_id, name, status, description, created_at, updated_at")
    .eq("organization_id", DEFAULT_ORG_ID)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getProjectById(id: string): Promise<Project | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("organization_id", DEFAULT_ORG_ID)
    .single();
  if (error) return null;
  return data;
}
