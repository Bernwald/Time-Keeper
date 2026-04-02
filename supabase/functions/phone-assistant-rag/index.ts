// Phone Assistant RAG — Real-time knowledge retrieval during calls
// Vapi Server URL mode: receives function-call webhooks, returns context
//
// Flow:
// 1. Vapi sends tool-call with caller question
// 2. We resolve the phone number → org_id + assistant config
// 3. Embed the question, run hybrid_search_boosted
// 4. Build context from top chunks, return to Vapi → caller hears answer

import { getServiceClient, jsonResponse, errorResponse } from "../_shared/supabase.ts";
import { embedText } from "../_shared/embeddings.ts";
import { verifyVapiSignature } from "../_shared/vapi-verify.ts";

// Vapi Server URL message types
type VapiMessage = {
  message: {
    type: string;
    // assistant-request
    call?: {
      phoneNumber?: { number?: string };
      customer?: { number?: string };
      assistantId?: string;
      assistant?: { id?: string };
    };
    // function-call
    functionCall?: {
      name: string;
      parameters: Record<string, string>;
    };
    // tool-calls
    toolCalls?: Array<{
      id: string;
      type: string;
      function: { name: string; arguments: string };
    }>;
    // top-level assistant reference
    assistant?: { id?: string };
  };
};

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, x-vapi-signature",
      },
    });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  const bodyText = await req.text();

  // Verify webhook signature
  const signature = req.headers.get("x-vapi-signature");
  const valid = await verifyVapiSignature(bodyText, signature);
  if (!valid) {
    return errorResponse("Invalid signature", 401);
  }

  let payload: VapiMessage;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const messageType = payload.message?.type;

  console.log(`[phone-rag] messageType=${messageType}, phone=${payload.message?.call?.phoneNumber?.number ?? "none"}, assistantId=${payload.message?.call?.assistantId ?? "none"}`);

  // ─── ASSISTANT REQUEST ────────────────────────────────────────────
  // Vapi calls this when a new call starts to get assistant config
  if (messageType === "assistant-request") {
    const assistant = await resolveAssistantConfig(payload.message);

    if (!assistant) {
      return jsonResponse({
        error: "No assistant configured for this number",
      }, 404);
    }

    // Check business hours
    if (assistant.business_hours_start && assistant.business_hours_end) {
      const isWithinHours = await checkBusinessHours(
        assistant.business_hours_start,
        assistant.business_hours_end,
        assistant.business_hours_tz ?? "Europe/Berlin",
      );
      if (!isWithinHours) {
        return jsonResponse({
          assistant: {
            firstMessage: assistant.after_hours_message,
            model: {
              provider: "anthropic",
              model: "claude-sonnet-4-6",
              messages: [
                {
                  role: "system",
                  content: "Inform the caller that the service is currently unavailable and end the call politely.",
                },
              ],
            },
            endCallAfterSilenceSeconds: 5,
          },
        });
      }
    }

    // Determine greeting based on language mode
    const greeting =
      assistant.language_mode === "en"
        ? assistant.greeting_en
        : assistant.greeting_de;

    // Return assistant config with RAG tool
    return jsonResponse({
      assistant: {
        firstMessage: greeting,
        model: {
          provider: "anthropic",
          model: "claude-sonnet-4-6",
          messages: [
            {
              role: "system",
              content: assistant.system_prompt,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "search_knowledge",
                description:
                  "Search the company knowledge base to answer customer questions. Use this for any factual question.",
                parameters: {
                  type: "object",
                  properties: {
                    query: {
                      type: "string",
                      description: "The search query based on the customer's question",
                    },
                  },
                  required: ["query"],
                },
              },
            },
          ],
        },
        voice: {
          provider: "openai",
          voiceId:
            assistant.language_mode === "en"
              ? assistant.voice_id_en
              : assistant.voice_id_de,
        },
        maxDurationSeconds: assistant.max_call_duration_seconds,
        silenceTimeoutSeconds: 30,
        endCallMessage: "Vielen Dank fuer Ihren Anruf. Auf Wiedersehen!",
      },
    });
  }

  // ─── TOOL CALLS (Vapi v2 format) ──────────────────────────────────
  if (messageType === "tool-calls") {
    const toolCalls = payload.message.toolCalls ?? [];
    const results = [];

    for (const toolCall of toolCalls) {
      if (toolCall.function.name === "search_knowledge") {
        let args: Record<string, string>;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          results.push({
            toolCallId: toolCall.id,
            result: "Fehler beim Parsen der Anfrage.",
          });
          continue;
        }

        const query = args.query ?? "";
        if (!query.trim()) {
          results.push({
            toolCallId: toolCall.id,
            result: "Keine Suchanfrage angegeben.",
          });
          continue;
        }

        // Get org from call context (phone number or assistantId fallback)
        const assistant = await resolveAssistantConfig(payload.message);

        if (!assistant) {
          results.push({
            toolCallId: toolCall.id,
            result: "Kein Assistent konfiguriert.",
          });
          continue;
        }

        const context = await searchKnowledge(
          assistant.org_id,
          query,
          assistant.max_chunks ?? 5,
          assistant.boost_factor ?? 1.5,
        );

        results.push({
          toolCallId: toolCall.id,
          result: context || "Keine relevanten Informationen gefunden.",
        });
      } else {
        results.push({
          toolCallId: toolCall.id,
          result: "Unbekannte Funktion.",
        });
      }
    }

    return jsonResponse({ results });
  }

  // ─── FUNCTION CALL (Vapi v1 format, fallback) ────────────────────
  if (messageType === "function-call") {
    const fn = payload.message.functionCall;
    if (!fn || fn.name !== "search_knowledge") {
      return jsonResponse({ result: "Unbekannte Funktion." });
    }

    const query = fn.parameters?.query ?? "";
    if (!query.trim()) {
      return jsonResponse({ result: "Keine Suchanfrage angegeben." });
    }

    const assistant = await resolveAssistantConfig(payload.message);

    if (!assistant) {
      return jsonResponse({ result: "Kein Assistent konfiguriert." });
    }

    const context = await searchKnowledge(
      assistant.org_id,
      query,
      assistant.max_chunks ?? 5,
      assistant.boost_factor ?? 1.5,
    );

    return jsonResponse({
      result: context || "Keine relevanten Informationen gefunden.",
    });
  }

  // ─── OTHER MESSAGE TYPES ──────────────────────────────────────────
  // hang, end-of-call-report, etc. — acknowledge
  return jsonResponse({ ok: true });
});

// ─── HELPERS ──────────────────────────────────────────────────────────────

type AssistantConfig = {
  org_id: string;
  assistant_id: string;
  assistant_name: string;
  system_prompt: string;
  greeting_de: string;
  greeting_en: string;
  voice_id_de: string;
  voice_id_en: string;
  language_mode: string;
  max_chunks: number;
  boost_factor: number;
  max_call_duration_seconds: number;
  business_hours_start: string;
  business_hours_end: string;
  business_hours_tz: string;
  after_hours_message: string;
};

/**
 * Resolve assistant config from call context.
 * Priority: phone number → provider_assistant_id (fallback for Talk button / browser calls)
 */
async function resolveAssistantConfig(
  message: VapiMessage["message"],
): Promise<AssistantConfig | null> {
  const db = getServiceClient();
  const calledNumber = message.call?.phoneNumber?.number ?? "";
  // Vapi sends assistantId in different locations depending on message type
  const providerAssistantId =
    message.call?.assistantId
    ?? message.call?.assistant?.id
    ?? message.assistant?.id
    ?? "";

  // Try phone number first
  if (calledNumber) {
    const { data } = await db.rpc("get_org_for_phone_number", {
      p_phone_number: calledNumber,
    });
    if (data && data.length > 0) {
      console.log("Resolved org via phone number:", calledNumber);
      return data[0];
    }
  }

  // Fallback: resolve via provider_assistant_id (Vapi Talk button, browser calls)
  if (providerAssistantId) {
    const { data } = await db.rpc("get_org_for_provider_assistant", {
      p_provider_assistant_id: providerAssistantId,
    });
    if (data && data.length > 0) {
      console.log("Resolved org via provider_assistant_id:", providerAssistantId);
      return data[0];
    }
  }

  console.error("Could not resolve org. calledNumber:", calledNumber, "assistantId:", providerAssistantId);
  return null;
}

async function searchKnowledge(
  orgId: string,
  query: string,
  maxChunks: number,
  boostFactor: number,
): Promise<string> {
  const db = getServiceClient();

  // Generate embedding for semantic search
  const embedding = await embedText(query);

  let chunks: Array<{ chunk_text: string; source_title: string }>;

  if (embedding) {
    // Hybrid search (FTS + vector)
    const { data, error } = await db.rpc("hybrid_search_boosted", {
      p_org_id: orgId,
      p_query: query,
      p_embedding: JSON.stringify(embedding),
      p_boost_source_ids: [],
      p_boost_factor: boostFactor,
      p_limit: maxChunks,
    });

    if (error) {
      console.error("Hybrid search error:", error);
      // Fallback to FTS
      const { data: ftsData } = await db.rpc("search_chunks", {
        p_org_id: orgId,
        p_query: query,
        p_limit: maxChunks,
      });
      chunks = ftsData ?? [];
    } else {
      chunks = data ?? [];
    }
  } else {
    // FTS only
    const { data, error } = await db.rpc("search_chunks", {
      p_org_id: orgId,
      p_query: query,
      p_limit: maxChunks,
    });
    if (error) {
      console.error("FTS error:", error);
      return "";
    }
    chunks = data ?? [];
  }

  if (!chunks || chunks.length === 0) return "";

  // Build context string for the LLM
  return chunks
    .map(
      (c: { chunk_text: string; source_title: string }, i: number) =>
        `[Quelle ${i + 1}: ${c.source_title}]\n${c.chunk_text}`,
    )
    .join("\n\n---\n\n");
}

async function checkBusinessHours(
  start: string,
  end: string,
  tz: string,
): Promise<boolean> {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const currentTime = formatter.format(now);
    return currentTime >= start.slice(0, 5) && currentTime <= end.slice(0, 5);
  } catch {
    // If timezone parsing fails, assume within hours
    return true;
  }
}
