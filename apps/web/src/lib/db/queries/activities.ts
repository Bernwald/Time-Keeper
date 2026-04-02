import { createUserClient } from "../supabase-server";
import { requireOrgId } from "../org-context";

export type Activity = {
  id: string;
  activity_type: string;
  title: string;
  description: string | null;
  occurred_at: string;
  duration_minutes: number | null;
  created_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ActivityWithCreator = Activity & {
  created_by_name: string;
};

export type ActivityLink = {
  id: string;
  linked_type: string;
  linked_id: string;
  linked_name: string;
  created_at: string;
};

export const ACTIVITY_TYPES = [
  { value: "note", label: "Notiz" },
  { value: "meeting", label: "Meeting" },
  { value: "call", label: "Anruf" },
  { value: "email", label: "E-Mail" },
  { value: "decision", label: "Entscheidung" },
  { value: "milestone", label: "Meilenstein" },
] as const;

export async function listActivities(limit = 50): Promise<Activity[]> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("activities")
    .select("*")
    .eq("organization_id", orgId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getActivityById(id: string): Promise<Activity | null> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("activities")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
  if (error) return null;
  return data;
}

export async function getActivitiesForEntity(
  linkedType: string,
  linkedId: string,
  limit = 50,
): Promise<ActivityWithCreator[]> {
  const db = await createUserClient();
  const { data, error } = await db.rpc("get_activities_for_entity", {
    p_linked_type: linkedType,
    p_linked_id: linkedId,
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []) as ActivityWithCreator[];
}

export async function getActivityLinksResolved(
  activityId: string,
): Promise<ActivityLink[]> {
  const db = await createUserClient();
  const { data, error } = await db.rpc("get_activity_links_resolved", {
    p_activity_id: activityId,
  });
  if (error) throw error;
  return (data ?? []) as ActivityLink[];
}
