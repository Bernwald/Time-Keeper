"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/db/queries/organization";
import {
  updateOrganizationAdmin,
  setOrgFeature,
  removeOrgFeatureOverride,
  inviteUserToOrg,
  updateOrgPlan,
} from "@/lib/db/queries/admin";
import { createServiceClient } from "@/lib/db/supabase-server";

async function requireAdmin() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) throw new Error("Unauthorized");
}

export async function createOrganization(formData: FormData) {
  await requireAdmin();

  const name = (formData.get("name") as string)?.trim();
  const slug = (formData.get("slug") as string)?.trim();
  if (!name || !slug) return;

  const db = createServiceClient();
  const { data, error } = await db
    .from("organizations")
    .insert({
      name,
      slug,
      status: "active",
      plan_id: "standard",
      metadata: {
        branding: { display_name: name, short_name: name.slice(0, 2).toUpperCase() },
        instance_type: "shared",
      },
    })
    .select("id")
    .single();

  if (error || !data) return;

  revalidatePath("/admin/kunden");
  redirect(`/admin/kunden/${data.id}`);
}

export async function updateOrganization(id: string, formData: FormData) {
  await requireAdmin();

  const name = (formData.get("name") as string)?.trim();
  const status = (formData.get("status") as string)?.trim();
  const planId = (formData.get("plan") as string)?.trim();

  if (!name) return;

  // Fetch current metadata to merge
  const db = createServiceClient();
  const { data: org } = await db.from("organizations").select("metadata").eq("id", id).single();
  const metadata = (org?.metadata as Record<string, unknown>) ?? {};

  const branding = (metadata.branding as Record<string, unknown>) ?? {};
  branding.display_name = name;
  branding.short_name = name.slice(0, 2).toUpperCase();

  await updateOrganizationAdmin(id, {
    name,
    status: status || "active",
    metadata: { ...metadata, branding },
  });

  // Update plan and sync features
  if (planId) {
    await updateOrgPlan(id, planId);
  }

  revalidatePath(`/admin/kunden/${id}`);
  revalidatePath("/admin/kunden");
}

export async function toggleFeature(orgId: string, featureKey: string, enabled: boolean) {
  await requireAdmin();
  await setOrgFeature(orgId, featureKey, enabled);
  revalidatePath(`/admin/kunden/${orgId}`);
}

export async function resetFeature(orgId: string, featureKey: string) {
  await requireAdmin();
  await removeOrgFeatureOverride(orgId, featureKey);
  revalidatePath(`/admin/kunden/${orgId}`);
}

export async function inviteMember(orgId: string, formData: FormData) {
  await requireAdmin();

  const email = (formData.get("email") as string)?.trim();
  const role = (formData.get("role") as string)?.trim() || "member";

  if (!email) return;

  await inviteUserToOrg(orgId, email, role);
  revalidatePath(`/admin/kunden/${orgId}`);
}
