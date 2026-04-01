import { createServiceClient, DEFAULT_ORG_ID } from "../supabase";

export type Contact = {
  id: string;
  company_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  role_title: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export async function listContacts(): Promise<Contact[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("contacts")
    .select("id, company_id, first_name, last_name, email, phone, role_title, status, notes, created_at, updated_at")
    .eq("organization_id", DEFAULT_ORG_ID)
    .order("last_name");
  if (error) throw error;
  return data ?? [];
}

export async function getContactById(id: string): Promise<Contact | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("contacts")
    .select("*")
    .eq("id", id)
    .eq("organization_id", DEFAULT_ORG_ID)
    .single();
  if (error) return null;
  return data;
}
