import { createServiceClient } from "../supabase-server";

export type AdminOrg = {
  id: string;
  slug: string;
  name: string;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  member_count: number;
};

export type AdminOrgDetail = AdminOrg & {
  members: AdminOrgMember[];
  features: AdminOrgFeature[];
};

export type AdminOrgMember = {
  id: string;
  user_id: string;
  role: string;
  is_default: boolean;
  created_at: string;
  profile: {
    full_name: string | null;
    email: string | null;
  };
};

export type AdminOrgFeature = {
  feature_key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  is_core: boolean;
  has_override: boolean;
};

export type AdminStats = {
  orgCount: number;
  userCount: number;
  sourceCount: number;
};

export async function getAdminStats(): Promise<AdminStats> {
  const db = createServiceClient();

  const [orgs, users, sources] = await Promise.all([
    db.from("organizations").select("id", { count: "exact", head: true }),
    db.from("profiles").select("id", { count: "exact", head: true }),
    db.from("sources").select("id", { count: "exact", head: true }),
  ]);

  return {
    orgCount: orgs.count ?? 0,
    userCount: users.count ?? 0,
    sourceCount: sources.count ?? 0,
  };
}

export async function listOrganizations(): Promise<AdminOrg[]> {
  const db = createServiceClient();

  const { data: orgs, error } = await db
    .from("organizations")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !orgs) return [];

  // Get member counts
  const { data: counts } = await db
    .from("organization_members")
    .select("organization_id");

  const countMap = new Map<string, number>();
  if (counts) {
    for (const row of counts) {
      countMap.set(row.organization_id, (countMap.get(row.organization_id) ?? 0) + 1);
    }
  }

  return orgs.map((org) => ({
    ...org,
    member_count: countMap.get(org.id) ?? 0,
  }));
}

export async function getOrganizationAdmin(id: string): Promise<AdminOrgDetail | null> {
  const db = createServiceClient();

  // Fetch org
  const { data: org, error } = await db
    .from("organizations")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !org) return null;

  // Fetch members with profiles
  const { data: members } = await db
    .from("organization_members")
    .select("id, user_id, role, is_default, created_at, profiles(full_name, email)")
    .eq("organization_id", id)
    .order("created_at");

  // Fetch all feature flags + org overrides
  const { data: flags } = await db.from("feature_flags").select("*").order("key");
  const { data: overrides } = await db
    .from("organization_features")
    .select("*")
    .eq("organization_id", id);

  const overrideMap = new Map<string, boolean>();
  if (overrides) {
    for (const o of overrides) {
      overrideMap.set(o.feature_key, o.enabled);
    }
  }

  const features: AdminOrgFeature[] = (flags ?? []).map((f: any) => ({
    feature_key: f.key,
    name: f.name,
    description: f.description,
    is_core: f.is_core,
    has_override: overrideMap.has(f.key),
    enabled: overrideMap.has(f.key) ? overrideMap.get(f.key)! : f.is_core,
  }));

  // Count members
  const memberCount = members?.length ?? 0;

  return {
    ...org,
    member_count: memberCount,
    members: (members ?? []).map((m: any) => ({
      ...m,
      profile: m.profiles ?? { full_name: null, email: null },
    })),
    features,
  };
}

export async function updateOrganizationAdmin(
  id: string,
  data: { name?: string; status?: string; metadata?: Record<string, unknown> },
) {
  const db = createServiceClient();
  await db.from("organizations").update(data).eq("id", id);
}

export async function setOrgFeature(orgId: string, featureKey: string, enabled: boolean) {
  const db = createServiceClient();
  await db.from("organization_features").upsert(
    {
      organization_id: orgId,
      feature_key: featureKey,
      enabled,
    },
    { onConflict: "organization_id,feature_key" },
  );
}

export async function removeOrgFeatureOverride(orgId: string, featureKey: string) {
  const db = createServiceClient();
  await db
    .from("organization_features")
    .delete()
    .eq("organization_id", orgId)
    .eq("feature_key", featureKey);
}

export async function inviteUserToOrg(orgId: string, email: string, role: string = "member") {
  const db = createServiceClient();

  // Check if user exists
  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .eq("email", email)
    .single();

  if (!profile) {
    // Invite via Supabase Auth
    const { data: invite, error: inviteError } = await db.auth.admin.inviteUserByEmail(email);
    if (inviteError || !invite.user) {
      throw new Error(inviteError?.message ?? "Einladung fehlgeschlagen");
    }

    // Add membership
    await db.from("organization_members").insert({
      organization_id: orgId,
      user_id: invite.user.id,
      role,
      is_default: true,
    });
  } else {
    // User exists — add membership
    await db.from("organization_members").upsert(
      {
        organization_id: orgId,
        user_id: profile.id,
        role,
      },
      { onConflict: "organization_id,user_id" },
    );
  }
}
