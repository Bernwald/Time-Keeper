import { createUserClient } from "../supabase-server";
import { requireOrgId } from "../org-context";

export type Company = {
  id: string;
  name: string;
  website: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listCompanies(): Promise<Company[]> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("companies")
    .select("id, name, website, status, notes, created_at, updated_at")
    .eq("organization_id", orgId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getCompanyById(id: string): Promise<Company | null> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("companies")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
  if (error) return null;
  return data;
}
