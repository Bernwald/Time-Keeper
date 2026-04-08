// brand-manifest
//
// Returns the full brand guidelines for the caller's organization as a single
// JSON manifest. Used by the local brand-agent (packages/brand-agent) to bake
// briefings/HTML/PPTX in the customer's CI.
//
// Auth: requires a valid user JWT (Authorization: Bearer …). The org is
// resolved from the caller's `organization_members` row, so credentials never
// have to be hardcoded in the agent.

import { getServiceClient, jsonResponse, errorResponse } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return errorResponse("Missing bearer token", 401);

  const supabase = getServiceClient();

  // Validate token + resolve user
  const { data: userRes, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userRes?.user) return errorResponse("Invalid token", 401);
  const userId = userRes.user.id;

  // Resolve org (default first, fallback first membership)
  const { data: defaultMember } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle();

  let orgId = defaultMember?.organization_id as string | undefined;
  if (!orgId) {
    const { data: anyMember } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    orgId = anyMember?.organization_id as string | undefined;
  }
  if (!orgId) return errorResponse("No organization for user", 403);

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("id, name, slug, settings")
    .eq("id", orgId)
    .single();
  if (orgErr || !org) return errorResponse("Organization not found", 404);

  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const branding = (settings.branding ?? {}) as Record<string, unknown>;
  const ai       = (settings.ai ?? {}) as Record<string, unknown>;

  return jsonResponse({
    org: {
      id:   org.id,
      name: org.name,
      slug: org.slug,
    },
    branding,
    ai,
    fetched_at: new Date().toISOString(),
  });
});
