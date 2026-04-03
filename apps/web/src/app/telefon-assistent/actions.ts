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
      tools: buildAssistantTools(),
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
      tools: buildAssistantTools(),
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

// ─── TOOL DEFINITIONS ──────────────────────────────────────────────────────

function buildAssistantTools() {
  return [
    {
      type: "function",
      function: {
        name: "search_knowledge",
        description:
          "Search the knowledge base including past conversations, call transcripts, meeting notes, and all company information. Use this for ANY question about past interactions, contacts, or factual information.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The search query" },
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_knowledge_for_contact",
        description:
          "Search the knowledge base for information about a specific contact person, including past conversations and linked documents. Use when the caller asks about a specific person by name.",
        parameters: {
          type: "object",
          properties: {
            contact_name: {
              type: "string",
              description: "The name of the contact person to search for",
            },
            query: {
              type: "string",
              description: "Optional additional search query to refine results",
            },
          },
          required: ["contact_name"],
        },
      },
    },
  ];
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

// ─── CALENDAR INTEGRATION ──────────────────────────────────────────────────

export async function saveCalendarSettings(formData: FormData) {
  const orgId = await requireOrgId();
  const db = createServiceClient();

  const calendarId = (formData.get("calendar_id") as string)?.trim() || "primary";
  const defaultDuration = parseInt(formData.get("default_duration_minutes") as string, 10) || 30;
  const buffer = parseInt(formData.get("buffer_minutes") as string, 10) || 15;
  const workStart = (formData.get("working_hours_start") as string)?.trim() || "09:00";
  const workEnd = (formData.get("working_hours_end") as string)?.trim() || "17:00";
  const timezone = (formData.get("timezone") as string)?.trim() || "Europe/Berlin";

  const settings = {
    default_duration_minutes: defaultDuration,
    buffer_minutes: buffer,
    working_hours_start: workStart,
    working_hours_end: workEnd,
    timezone,
  };

  const { data: existing } = await db
    .from("calendar_integrations")
    .select("id")
    .eq("organization_id", orgId)
    .single();

  if (existing) {
    await db
      .from("calendar_integrations")
      .update({ calendar_id: calendarId, settings })
      .eq("id", existing.id);
  } else {
    await db.from("calendar_integrations").insert({
      organization_id: orgId,
      calendar_id: calendarId,
      settings,
    });
  }

  revalidatePath("/telefon-assistent/kalender");
  revalidatePath("/telefon-assistent/einstellungen");
}

export async function disconnectCalendar() {
  const orgId = await requireOrgId();
  const db = createServiceClient();

  await db
    .from("calendar_integrations")
    .update({
      status: "inactive",
      refresh_token: null,
      access_token: null,
      token_expires_at: null,
    })
    .eq("organization_id", orgId);

  revalidatePath("/telefon-assistent/kalender");
  revalidatePath("/telefon-assistent/einstellungen");
}

export async function getGoogleOAuthUrl(): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const redirectUri = `${appUrl}/telefon-assistent/kalender/callback`;

  const params = new URLSearchParams({
    client_id: clientId || "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar",
    access_type: "offline",
    prompt: "consent",
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<{ ok: boolean; error?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const redirectUri = `${appUrl}/telefon-assistent/kalender/callback`;

  if (!clientId || !clientSecret) {
    return { ok: false, error: "Google OAuth ist nicht konfiguriert." };
  }

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Google OAuth token exchange error:", errText);
      return { ok: false, error: "Token-Austausch fehlgeschlagen." };
    }

    const data = await response.json();
    const refreshToken = data.refresh_token;
    const accessToken = data.access_token;
    const expiresIn = data.expires_in ?? 3600;

    if (!refreshToken) {
      return { ok: false, error: "Kein Refresh-Token erhalten. Bitte erneut verbinden." };
    }

    const orgId = await requireOrgId();
    const db = createServiceClient();

    const tokenExpiresAt = new Date(Date.now() + (expiresIn - 60) * 1000).toISOString();

    const { data: existing } = await db
      .from("calendar_integrations")
      .select("id")
      .eq("organization_id", orgId)
      .single();

    if (existing) {
      await db
        .from("calendar_integrations")
        .update({
          refresh_token: refreshToken,
          access_token: accessToken,
          token_expires_at: tokenExpiresAt,
          status: "active",
        })
        .eq("id", existing.id);
    } else {
      await db.from("calendar_integrations").insert({
        organization_id: orgId,
        refresh_token: refreshToken,
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        status: "active",
      });
    }

    revalidatePath("/telefon-assistent/kalender");
    revalidatePath("/telefon-assistent/einstellungen");
    return { ok: true };
  } catch (err) {
    console.error("Google OAuth exchange error:", err);
    return { ok: false, error: "Unbekannter Fehler beim Token-Austausch." };
  }
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
