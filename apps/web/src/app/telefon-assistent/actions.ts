"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";

// ─── ASSISTANT CONFIG ──────────────────────────────────────────────────────

export async function createOrUpdateAssistant(formData: FormData) {
  const orgId = await requireOrgId();
  const db = createServiceClient();

  const name = (formData.get("name") as string)?.trim() || "Telefonassistent";
  const systemPrompt = (formData.get("system_prompt") as string)?.trim() || null;
  const greetingDe = (formData.get("greeting_de") as string)?.trim() || null;
  const greetingEn = (formData.get("greeting_en") as string)?.trim() || null;
  const voiceIdDe = (formData.get("voice_id_de") as string) || "alloy";
  const voiceIdEn = (formData.get("voice_id_en") as string) || "alloy";
  const languageMode = (formData.get("language_mode") as string) || "auto";
  const maxChunks = parseInt(formData.get("max_chunks") as string, 10) || 5;
  const boostFactor = parseFloat(formData.get("boost_factor") as string) || 1.5;
  const maxCallDuration = parseInt(formData.get("max_call_duration_seconds") as string, 10) || 600;
  const businessHoursStart = (formData.get("business_hours_start") as string)?.trim() || null;
  const businessHoursEnd = (formData.get("business_hours_end") as string)?.trim() || null;
  const businessHoursTz = (formData.get("business_hours_tz") as string)?.trim() || "Europe/Berlin";
  const afterHoursMessage = (formData.get("after_hours_message") as string)?.trim() || null;

  const values = {
    organization_id: orgId,
    name,
    system_prompt: systemPrompt,
    greeting_de: greetingDe,
    greeting_en: greetingEn,
    voice_id_de: voiceIdDe,
    voice_id_en: voiceIdEn,
    language_mode: languageMode,
    max_chunks: maxChunks,
    boost_factor: boostFactor,
    max_call_duration_seconds: maxCallDuration,
    business_hours_start: businessHoursStart,
    business_hours_end: businessHoursEnd,
    business_hours_tz: businessHoursTz,
    after_hours_message: afterHoursMessage,
  };

  // Upsert: create or update (unique on organization_id)
  const { data: existing } = await db
    .from("phone_assistants")
    .select("id")
    .eq("organization_id", orgId)
    .single();

  if (existing) {
    await db
      .from("phone_assistants")
      .update(values)
      .eq("id", existing.id);
  } else {
    await db.from("phone_assistants").insert(values);
  }

  revalidatePath("/telefon-assistent");
  revalidatePath("/telefon-assistent/einstellungen");
}

export async function toggleAssistantStatus() {
  const orgId = await requireOrgId();
  const db = createServiceClient();

  const { data: assistant } = await db
    .from("phone_assistants")
    .select("id, status")
    .eq("organization_id", orgId)
    .single();

  if (!assistant) return;

  const newStatus = assistant.status === "active" ? "paused" : "active";
  await db
    .from("phone_assistants")
    .update({ status: newStatus })
    .eq("id", assistant.id);

  revalidatePath("/telefon-assistent");
  revalidatePath("/telefon-assistent/einstellungen");
}

// ─── PHONE NUMBERS ─────────────────────────────────────────────────────────

export async function updatePhoneNumberName(phoneNumberId: string, displayName: string) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db
    .from("phone_numbers")
    .update({ display_name: displayName.trim() || null })
    .eq("id", phoneNumberId)
    .eq("organization_id", orgId);
  revalidatePath("/telefon-assistent/nummern");
}

// ─── CALL LOGS ─────────────────────────────────────────────────────────────

export async function deleteCallLog(callLogId: string) {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  await db
    .from("call_logs")
    .delete()
    .eq("id", callLogId)
    .eq("organization_id", orgId);
  revalidatePath("/telefon-assistent");
}
