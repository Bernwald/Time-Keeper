import { createUserClient } from "../supabase-server";
import { requireOrgId } from "../org-context";

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
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("projects")
    .select("id, company_id, name, status, description, created_at, updated_at")
    .eq("organization_id", orgId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getProjectById(id: string): Promise<Project | null> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
  if (error) return null;
  return data;
}
