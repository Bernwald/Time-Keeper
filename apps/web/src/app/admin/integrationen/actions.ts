"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/db/supabase-server";
import { isPlatformAdmin } from "@/lib/db/queries/organization";

export async function replayJobFailureAction(formData: FormData) {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) redirect("/");

  const failureId = formData.get("failure_id");
  if (typeof failureId !== "string" || !failureId) return;

  const supabase = createServiceClient();
  const { error } = await supabase.rpc("replay_job_failure", { p_failure_id: failureId });
  if (error) throw error;

  revalidatePath("/admin/integrationen");
}
