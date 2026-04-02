"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  redirect("/telefon-assistent");
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

// ─── VAPI PROVISIONING ─────────────────────────────────────────────────────

// ─── VAPI API (direct from server action — keys from Vercel env) ───────────

const VAPI_API_URL = "https://api.vapi.ai";

function getVapiKey(): string | undefined {
  return process.env.VAPI_API_KEY;
}

async function vapiRequest(
  path: string,
  method: string,
  body?: unknown,
): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
  const apiKey = getVapiKey();
  if (!apiKey) return { ok: false, error: "VAPI_API_KEY not set" };

  try {
    const response = await fetch(`${VAPI_API_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json();
    if (!response.ok) {
      return { ok: false, error: data?.message ?? `Vapi error: ${response.status}` };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function provisionVapiAssistant(): Promise<{ ok: boolean; error?: string }> {
  const apiKey = getVapiKey();
  if (!apiKey) {
    return { ok: false, error: "VAPI_API_KEY ist nicht konfiguriert. Bitte in Vercel Env-Variablen hinterlegen." };
  }

  const orgId = await requireOrgId();
  const db = createServiceClient();

  // Get assistant config
  const { data: pa } = await db
    .from("phone_assistants")
    .select("*")
    .eq("organization_id", orgId)
    .single();

  if (!pa) {
    return { ok: false, error: "Kein Telefonassistent konfiguriert. Bitte zuerst Einstellungen speichern." };
  }

  if (pa.provider_assistant_id) {
    revalidatePath("/telefon-assistent/einstellungen");
    return { ok: true };
  }

  const serverUrl = process.env.VAPI_SERVER_URL
    ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/phone-assistant-rag`;

  const result = await vapiRequest("/assistant", "POST", {
    name: `${pa.name} (${orgId.slice(0, 8)})`,
    serverUrl,
    serverUrlSecret: process.env.VAPI_SECRET ?? undefined,
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      messages: [{ role: "system", content: pa.system_prompt ?? "Du bist ein hilfreicher Telefonassistent." }],
      tools: [
        {
          type: "function",
          function: {
            name: "search_knowledge",
            description: "Search the company knowledge base to answer customer questions.",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string", description: "The search query" },
              },
              required: ["query"],
            },
          },
        },
      ],
    },
    voice: { provider: "openai", voiceId: pa.voice_id_de ?? "alloy" },
    firstMessage: pa.greeting_de ?? "Hallo, wie kann ich Ihnen helfen?",
    maxDurationSeconds: pa.max_call_duration_seconds ?? 600,
    silenceTimeoutSeconds: 30,
    endCallMessage: "Vielen Dank fuer Ihren Anruf. Auf Wiedersehen!",
  });

  if (!result.ok) {
    console.error("Vapi create assistant error:", result.error);
    return { ok: false, error: `Vapi-Fehler: ${result.error}` };
  }

  const vapiId = result.data?.id as string;

  // Store provider ID and activate
  await db
    .from("phone_assistants")
    .update({ provider_assistant_id: vapiId, status: "active" })
    .eq("id", pa.id);

  console.log("Vapi assistant created:", vapiId);

  revalidatePath("/telefon-assistent");
  revalidatePath("/telefon-assistent/einstellungen");
  return { ok: true };
}

export async function syncVapiConfig(): Promise<{ ok: boolean; error?: string }> {
  const apiKey = getVapiKey();
  if (!apiKey) {
    return { ok: false, error: "VAPI_API_KEY ist nicht konfiguriert." };
  }

  const orgId = await requireOrgId();
  const db = createServiceClient();

  const { data: pa } = await db
    .from("phone_assistants")
    .select("*")
    .eq("organization_id", orgId)
    .single();

  if (!pa?.provider_assistant_id) {
    return { ok: false, error: "Kein Provider-Assistent vorhanden." };
  }

  const result = await vapiRequest(`/assistant/${pa.provider_assistant_id}`, "PATCH", {
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      messages: [{ role: "system", content: pa.system_prompt ?? "Du bist ein hilfreicher Telefonassistent." }],
    },
    voice: {
      provider: "openai",
      voiceId: pa.language_mode === "en" ? pa.voice_id_en : pa.voice_id_de,
    },
    firstMessage: pa.language_mode === "en" ? pa.greeting_en : pa.greeting_de,
    maxDurationSeconds: pa.max_call_duration_seconds,
  });

  if (!result.ok) {
    console.error("Vapi sync error:", result.error);
    return { ok: false, error: `Vapi-Fehler: ${result.error}` };
  }

  revalidatePath("/telefon-assistent");
  revalidatePath("/telefon-assistent/einstellungen");
  return { ok: true };
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
