import { createServiceClient, DEFAULT_ORG_ID } from "../supabase";

export type SourceLink = {
  id: string;
  source_id: string;
  linked_type: string;
  linked_id: string;
  link_role: string;
  created_at: string;
  linked_name: string;
};

export type LinkedSource = {
  id: string;
  source_id: string;
  link_role: string;
  created_at: string;
  source_title: string;
  source_type: string;
  source_status: string;
};

export async function listLinksForSource(sourceId: string): Promise<SourceLink[]> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("get_source_links_resolved", {
    p_source_id: sourceId,
  });
  if (error) throw error;
  return (data ?? []) as SourceLink[];
}

export async function listSourcesForEntity(
  linkedType: string,
  linkedId: string,
): Promise<LinkedSource[]> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("get_sources_for_entity", {
    p_linked_type: linkedType,
    p_linked_id: linkedId,
  });
  if (error) throw error;
  return (data ?? []) as LinkedSource[];
}

export async function getLinkedSourceIds(
  linkedType: string,
  linkedId: string,
): Promise<string[]> {
  const sources = await listSourcesForEntity(linkedType, linkedId);
  return sources.map((s) => s.source_id);
}
