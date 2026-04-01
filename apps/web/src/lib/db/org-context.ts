import { createUserClient } from "./supabase-server";

/**
 * Returns the active organization ID for the current request.
 *
 * Resolution order:
 * 1. FIXED_ORG_ID env var (dedicated instance mode)
 * 2. User's default org from organization_members
 * 3. User's first org membership
 *
 * Throws if no org can be resolved.
 */
export async function requireOrgId(): Promise<string> {
  // Dedicated instance: fixed org from env
  const fixedOrgId = process.env.FIXED_ORG_ID;
  if (fixedOrgId) return fixedOrgId;

  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  // Try default org first
  const { data: defaultMember } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  if (defaultMember) return defaultMember.organization_id;

  // Fallback: first org membership
  const { data: firstMember } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (firstMember) return firstMember.organization_id;

  throw new Error("User has no organization membership");
}
