// Phone Assistant Provision — Manage Vapi assistants and phone numbers
// Called from server actions to:
// 1. Create/update Vapi assistant for an org
// 2. Provision/release phone numbers via Vapi
// 3. Sync configuration changes

import { getServiceClient, jsonResponse, errorResponse } from "../_shared/supabase.ts";
import { getVapiKeyForOrg } from "../_shared/integration-registry.ts";

const VAPI_API_URL = "https://api.vapi.ai";

function getServerUrl(): string {
  return Deno.env.get("VAPI_SERVER_URL") ?? "";
}

async function vapiRequest(
  path: string,
  method: string,
  body?: unknown,
  orgId?: string,
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  try {
    const apiKey = orgId
      ? await getVapiKeyForOrg(orgId)
      : Deno.env.get("VAPI_API_KEY") ?? "";

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

type ProvisionAction =
  | { action: "create_assistant"; org_id: string }
  | { action: "update_assistant"; org_id: string }
  | { action: "provision_number"; org_id: string; area_code?: string }
  | { action: "release_number"; phone_number_id: string }
  | { action: "sync_config"; org_id: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // Authenticate via service role key
  const authHeader = req.headers.get("authorization") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // Accept both "Bearer <key>" and raw key
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!serviceKey || token !== serviceKey) {
    console.error("Auth failed: token does not match service role key");
    return errorResponse("Unauthorized", 401);
  }

  let payload: ProvisionAction;
  try {
    payload = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const db = getServiceClient();

  switch (payload.action) {
    // ─── CREATE ASSISTANT ──────────────────────────────────────────
    case "create_assistant": {
      const { data: pa } = await db
        .from("phone_assistants")
        .select("*")
        .eq("organization_id", payload.org_id)
        .single();

      if (!pa) {
        return errorResponse("No phone assistant config found", 404);
      }

      if (pa.provider_assistant_id) {
        return errorResponse("Assistant already exists at provider", 409);
      }

      const serverUrl = getServerUrl();
      if (!serverUrl) {
        return errorResponse("VAPI_SERVER_URL not configured", 500);
      }

      const result = await vapiRequest("/assistant", "POST", {
        name: `${pa.name} (${payload.org_id.slice(0, 8)})`,
        serverUrl,
        serverUrlSecret: Deno.env.get("VAPI_SECRET") ?? undefined,
        model: {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          messages: [{ role: "system", content: pa.system_prompt }],
          tools: buildAssistantTools(),
        },
        voice: {
          provider: "openai",
          voiceId: pa.voice_id_de,
        },
        firstMessage: pa.greeting_de,
        maxDurationSeconds: pa.max_call_duration_seconds,
        silenceTimeoutSeconds: 30,
        endCallMessage: "Vielen Dank fuer Ihren Anruf. Auf Wiedersehen!",
      }, payload.org_id);

      if (!result.ok) {
        return errorResponse(`Vapi: ${result.error}`, 502);
      }

      const vapiAssistant = result.data as { id: string };

      // Store provider assistant ID
      await db
        .from("phone_assistants")
        .update({
          provider_assistant_id: vapiAssistant.id,
          status: "active",
        })
        .eq("id", pa.id);

      return jsonResponse({ ok: true, provider_assistant_id: vapiAssistant.id });
    }

    // ─── UPDATE ASSISTANT ──────────────────────────────────────────
    case "update_assistant": {
      const { data: pa } = await db
        .from("phone_assistants")
        .select("*")
        .eq("organization_id", payload.org_id)
        .single();

      if (!pa?.provider_assistant_id) {
        return errorResponse("No provider assistant to update", 404);
      }

      const result = await vapiRequest(
        `/assistant/${pa.provider_assistant_id}`,
        "PATCH",
        {
          name: `${pa.name} (${payload.org_id.slice(0, 8)})`,
          model: {
            provider: "anthropic",
            model: "claude-sonnet-4-6",
            messages: [{ role: "system", content: pa.system_prompt }],
            tools: buildAssistantTools(),
          },
          voice: {
            provider: "openai",
            voiceId: pa.voice_id_de,
          },
          firstMessage: pa.greeting_de,
          maxDurationSeconds: pa.max_call_duration_seconds,
        },
        payload.org_id,
      );

      if (!result.ok) {
        return errorResponse(`Vapi: ${result.error}`, 502);
      }

      return jsonResponse({ ok: true });
    }

    // ─── PROVISION NUMBER ──────────────────────────────────────────
    case "provision_number": {
      const { data: pa } = await db
        .from("phone_assistants")
        .select("id, provider_assistant_id")
        .eq("organization_id", payload.org_id)
        .single();

      if (!pa?.provider_assistant_id) {
        return errorResponse("Create assistant first", 400);
      }

      // Buy a phone number via Vapi
      const result = await vapiRequest("/phone-number", "POST", {
        assistantId: pa.provider_assistant_id,
        provider: "twilio",
        numberDesiredAreaCode: payload.area_code ?? undefined,
      }, payload.org_id);

      if (!result.ok) {
        return errorResponse(`Vapi: ${result.error}`, 502);
      }

      const vapiNumber = result.data as {
        id: string;
        number: string;
      };

      // Store in our DB
      const { data: phoneRecord } = await db
        .from("phone_numbers")
        .insert({
          organization_id: payload.org_id,
          assistant_id: pa.id,
          phone_number: vapiNumber.number,
          provider_phone_id: vapiNumber.id,
          status: "active",
        })
        .select("id, phone_number")
        .single();

      return jsonResponse({
        ok: true,
        phone_number_id: phoneRecord?.id,
        phone_number: vapiNumber.number,
      });
    }

    // ─── RELEASE NUMBER ────────────────────────────────────────────
    case "release_number": {
      const { data: pn } = await db
        .from("phone_numbers")
        .select("id, provider_phone_id")
        .eq("id", payload.phone_number_id)
        .single();

      if (!pn) {
        return errorResponse("Phone number not found", 404);
      }

      if (pn.provider_phone_id) {
        const result = await vapiRequest(
          `/phone-number/${pn.provider_phone_id}`,
          "DELETE",
        );
        if (!result.ok) {
          console.error("Failed to release number at Vapi:", result.error);
        }
      }

      await db
        .from("phone_numbers")
        .update({ status: "inactive" })
        .eq("id", pn.id);

      return jsonResponse({ ok: true });
    }

    // ─── SYNC CONFIG ───────────────────────────────────────────────
    case "sync_config": {
      // Re-read config and push to Vapi
      const { data: pa } = await db
        .from("phone_assistants")
        .select("*")
        .eq("organization_id", payload.org_id)
        .single();

      if (!pa?.provider_assistant_id) {
        return jsonResponse({ ok: true, skipped: "no provider assistant" });
      }

      const result = await vapiRequest(
        `/assistant/${pa.provider_assistant_id}`,
        "PATCH",
        {
          model: {
            provider: "anthropic",
            model: "claude-sonnet-4-6",
            messages: [{ role: "system", content: pa.system_prompt }],
            tools: buildAssistantTools(),
          },
          voice: {
            provider: "openai",
            voiceId: pa.language_mode === "en" ? pa.voice_id_en : pa.voice_id_de,
          },
          firstMessage:
            pa.language_mode === "en" ? pa.greeting_en : pa.greeting_de,
          maxDurationSeconds: pa.max_call_duration_seconds,
        },
        payload.org_id,
      );

      return jsonResponse({ ok: result.ok, error: result.error });
    }

    default:
      return errorResponse("Unknown action", 400);
  }
});

// ─── HELPERS ──────────────────────────────────────────────────────────────

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
