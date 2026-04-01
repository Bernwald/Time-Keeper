import { createUserClient } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";

export type OrgFeature = {
  feature_key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  config: Record<string, unknown>;
};

export async function getOrgFeatures(): Promise<OrgFeature[]> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db.rpc("get_org_features", { p_org_id: orgId });
  if (error) return [];
  return (data ?? []) as OrgFeature[];
}

export async function hasFeature(featureKey: string): Promise<boolean> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db.rpc("org_has_feature", {
    p_org_id: orgId,
    p_feature_key: featureKey,
  });
  if (error) return false;
  return data === true;
}
