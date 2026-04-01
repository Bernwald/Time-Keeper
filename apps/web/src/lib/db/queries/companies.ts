import { createServiceClient, DEFAULT_ORG_ID } from "../supabase";

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
  const db = createServiceClient();
  const { data, error } = await db
    .from("companies")
    .select("id, name, website, status, notes, created_at, updated_at")
    .eq("organization_id", DEFAULT_ORG_ID)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getCompanyById(id: string): Promise<Company | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("companies")
    .select("*")
    .eq("id", id)
    .eq("organization_id", DEFAULT_ORG_ID)
    .single();
  if (error) return null;
  return data;
}
