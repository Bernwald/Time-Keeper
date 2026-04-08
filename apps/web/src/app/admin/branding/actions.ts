"use server";

import { revalidatePath } from "next/cache";
import { createUserClient } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";
import type { BrandingState } from "./page";

export async function saveBranding(branding: BrandingState): Promise<void> {
  const orgId = await requireOrgId();
  const db = await createUserClient();

  const { data: existing } = await db
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .single();

  const current = (existing?.settings as Record<string, unknown> | null) ?? {};
  const next = { ...current, branding };

  const { error } = await db
    .from("organizations")
    .update({ settings: next })
    .eq("id", orgId);

  if (error) throw error;

  revalidatePath("/admin/branding");
}
