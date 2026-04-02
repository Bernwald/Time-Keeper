import { createUserClient } from "../supabase-server";
import { requireOrgId } from "../org-context";

export type Tag = {
  id: string;
  name: string;
  color: string | null;
  category: string | null;
  created_at: string;
};

export type EntityTag = {
  id: string;
  name: string;
  color: string | null;
  category: string | null;
};

export async function listTags(): Promise<Tag[]> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("tags")
    .select("id, name, color, category, created_at")
    .eq("organization_id", orgId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listTagsByCategory(): Promise<Record<string, Tag[]>> {
  const tags = await listTags();
  const grouped: Record<string, Tag[]> = {};
  for (const tag of tags) {
    const key = tag.category ?? "Allgemein";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(tag);
  }
  return grouped;
}

export async function getTagsForEntity(
  entityType: string,
  entityId: string,
): Promise<EntityTag[]> {
  const db = await createUserClient();
  const { data, error } = await db.rpc("get_tags_for_entity", {
    p_entity_type: entityType,
    p_entity_id: entityId,
  });
  if (error) throw error;
  return (data ?? []) as EntityTag[];
}

export async function getEntitiesByTag(
  tagId: string,
  entityType?: string,
): Promise<{ entity_type: string; entity_id: string; created_at: string }[]> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db.rpc("get_entities_by_tag", {
    p_org_id: orgId,
    p_tag_id: tagId,
    p_entity_type: entityType ?? null,
  });
  if (error) throw error;
  return (data ?? []) as { entity_type: string; entity_id: string; created_at: string }[];
}

export async function getTagById(id: string): Promise<Tag | null> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("tags")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
  if (error) return null;
  return data;
}
