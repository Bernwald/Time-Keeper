// Phone Assistant Call Complete — Post-call processing
// Receives Vapi end-of-call-report webhook, then:
// 1. Creates a Source from the transcript (for RAG)
// 2. Chunks + embeds the transcript
// 3. Creates an Activity (activity_type = 'phone_call')
// 4. Matches caller to contact (fuzzy phone match)
// 5. Stores call_log record with metadata
// 6. Optionally generates AI summary

import { getServiceClient, jsonResponse, errorResponse } from "../_shared/supabase.ts";
import { embedText } from "../_shared/embeddings.ts";
import { splitIntoChunks, countWords } from "../_shared/chunker.ts";
import { verifyVapiSignature } from "../_shared/vapi-verify.ts";

type VapiEndOfCallReport = {
  message: {
    type: "end-of-call-report";
    call: {
      id: string;
      orgId?: string;
      phoneNumber?: { number?: string };
      customer?: { number?: string };
      startedAt?: string;
      endedAt?: string;
      status?: string;
      cost?: number;
      transcript?: string;
      recordingUrl?: string;
      analysis?: {
        summary?: string;
        successEvaluation?: string;
      };
      messages?: Array<{
        role: string;
        message: string;
        time: number;
      }>;
    };
  };
};

Deno.serve(async (req: Request) => {
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

  let payload: VapiEndOfCallReport;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  if (payload.message?.type !== "end-of-call-report") {
    return jsonResponse({ ok: true, skipped: true });
  }

  const call = payload.message.call;
  if (!call?.id) {
    return errorResponse("Missing call ID", 400);
  }

  const db = getServiceClient();

  // ─── 1. Resolve org from called number ─────────────────────────────
  const calledNumber = call.phoneNumber?.number ?? "";
  const { data: config } = await db.rpc("get_org_for_phone_number", {
    p_phone_number: calledNumber,
  });

  if (!config || config.length === 0) {
    console.error(`No org found for number: ${calledNumber}`);
    return errorResponse("No org found for phone number", 404);
  }

  const assistant = config[0];
  const orgId = assistant.org_id;
  const assistantId = assistant.assistant_id;

  // ─── 2. Idempotency check ─────────────────────────────────────────
  const { data: existing } = await db
    .from("call_logs")
    .select("id")
    .eq("provider_call_id", call.id)
    .single();

  if (existing) {
    console.log(`Call ${call.id} already processed, skipping`);
    return jsonResponse({ ok: true, duplicate: true });
  }

  // ─── 3. Build transcript text ──────────────────────────────────────
  let transcript = call.transcript ?? "";

  // If no transcript but we have messages, build from messages
  if (!transcript && call.messages && call.messages.length > 0) {
    transcript = call.messages
      .map((m) => `${m.role === "assistant" ? "Assistent" : "Anrufer"}: ${m.message}`)
      .join("\n");
  }

  const callerNumber = call.customer?.number ?? "Unbekannt";
  const summary = call.analysis?.summary ?? null;
  const startedAt = call.startedAt ?? new Date().toISOString();
  const endedAt = call.endedAt ?? null;
  const durationSeconds = endedAt && startedAt
    ? Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000)
    : null;

  // Detect language from transcript (simple heuristic)
  const detectedLanguage = detectLanguage(transcript);

  // ─── 4. Match caller to contact ────────────────────────────────────
  let contactId: string | null = null;
  if (callerNumber !== "Unbekannt") {
    const { data: matchedContact } = await db.rpc("match_caller_to_contact", {
      p_org_id: orgId,
      p_caller_number: callerNumber,
    });
    contactId = matchedContact ?? null;
  }

  // ─── 5. Create Source from transcript (for RAG) ────────────────────
  let sourceId: string | null = null;
  if (transcript && transcript.length > 20) {
    const { data: source } = await db
      .from("sources")
      .insert({
        organization_id: orgId,
        title: `[Anruf] ${callerNumber} — ${new Date(startedAt).toLocaleDateString("de-DE")}`,
        description: summary ?? `Telefonat vom ${new Date(startedAt).toLocaleDateString("de-DE")}`,
        source_type: "phone_call",
        raw_text: transcript,
        word_count: countWords(transcript),
        status: "processing",
      })
      .select("id")
      .single();

    if (source) {
      sourceId = source.id;

      // Chunk + embed
      const chunks = splitIntoChunks(transcript);
      if (chunks.length > 0) {
        const embeddings = await Promise.all(
          chunks.map((c) => embedText(c.chunkText)),
        );

        const rows = chunks.map((c, i) => ({
          organization_id: orgId,
          source_id: source.id,
          chunk_index: c.chunkIndex,
          chunk_text: c.chunkText,
          token_count: c.tokenCount,
          char_start: c.charStart,
          char_end: c.charEnd,
          embedding: embeddings[i] ? JSON.stringify(embeddings[i]) : null,
        }));

        await db.from("content_chunks").insert(rows);
      }

      await db.from("sources").update({ status: "ready" }).eq("id", source.id);

      // Link source to contact if matched
      if (contactId) {
        await db.from("source_links").upsert(
          {
            organization_id: orgId,
            source_id: source.id,
            linked_type: "contact",
            linked_id: contactId,
            link_role: "phone_call",
          },
          { onConflict: "source_id,linked_type,linked_id" },
        );
      }
    }
  }

  // ─── 6. Create Activity ────────────────────────────────────────────
  let activityId: string | null = null;
  {
    const { data: activity } = await db
      .from("activities")
      .insert({
        organization_id: orgId,
        activity_type: "phone_call",
        title: `Anruf von ${callerNumber}`,
        description: summary ?? (transcript ? transcript.slice(0, 500) : null),
        occurred_at: startedAt,
        duration_minutes: durationSeconds ? Math.ceil(durationSeconds / 60) : null,
        metadata: {
          caller_number: callerNumber,
          called_number: calledNumber,
          detected_language: detectedLanguage,
          provider_call_id: call.id,
        },
      })
      .select("id")
      .single();

    if (activity) {
      activityId = activity.id;

      // Link activity to contact if matched
      if (contactId) {
        await db.from("activity_links").insert({
          organization_id: orgId,
          activity_id: activity.id,
          linked_type: "contact",
          linked_id: contactId,
        });
      }
    }
  }

  // ─── 7. Get phone_number_id ────────────────────────────────────────
  const { data: phoneNumberRecord } = await db
    .from("phone_numbers")
    .select("id")
    .eq("phone_number", calledNumber)
    .eq("organization_id", orgId)
    .single();

  // ─── 8. Store call_log ─────────────────────────────────────────────
  const { data: callLog, error: callLogError } = await db
    .from("call_logs")
    .insert({
      organization_id: orgId,
      assistant_id: assistantId,
      phone_number_id: phoneNumberRecord?.id ?? null,
      provider_call_id: call.id,
      caller_number: callerNumber,
      called_number: calledNumber,
      status: mapCallStatus(call.status),
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: durationSeconds,
      transcript,
      summary,
      detected_language: detectedLanguage,
      recording_url: call.recordingUrl ?? null,
      source_id: sourceId,
      activity_id: activityId,
      contact_id: contactId,
      cost_cents: call.cost ? Math.round(call.cost * 100) : null,
    })
    .select("id")
    .single();

  if (callLogError) {
    console.error("Error storing call log:", callLogError);
    return errorResponse("Failed to store call log", 500);
  }

  console.log(`Call ${call.id} processed: callLog=${callLog?.id}, source=${sourceId}, activity=${activityId}, contact=${contactId}`);

  return jsonResponse({
    ok: true,
    call_log_id: callLog?.id,
    source_id: sourceId,
    activity_id: activityId,
    contact_id: contactId,
  });
});

// ─── HELPERS ──────────────────────────────────────────────────────────────

function detectLanguage(text: string): string | null {
  if (!text || text.length < 20) return null;

  // Simple heuristic: count German-specific characters/words
  const germanIndicators =
    /\b(und|der|die|das|ist|ich|nicht|ein|eine|mit|auf|fuer|dass|werden|haben|auch|noch|nach|dann|wenn|ueber|oder|aber|kann|muss|wird|schon|sehr|nur)\b/gi;
  const englishIndicators =
    /\b(the|and|is|are|was|were|not|for|that|with|this|from|they|have|been|will|would|could|should|about|their|which|there|when|what|also|just|very|only)\b/gi;

  const germanCount = (text.match(germanIndicators) ?? []).length;
  const englishCount = (text.match(englishIndicators) ?? []).length;

  if (germanCount > englishCount * 1.5) return "de";
  if (englishCount > germanCount * 1.5) return "en";
  if (germanCount > 0 || englishCount > 0) return germanCount >= englishCount ? "de" : "en";
  return null;
}

function mapCallStatus(vapiStatus?: string): string {
  switch (vapiStatus) {
    case "ended":
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "no-answer":
    case "busy":
      return "missed";
    default:
      return "completed";
  }
}
