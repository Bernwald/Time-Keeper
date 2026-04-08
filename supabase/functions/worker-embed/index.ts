// worker-embed
//
// Drains the `embed` pgmq queue. For each message:
//   1. Upserts a `sources` row representing the Silver entity (one source per
//      provider+external_id, source_type='entity').
//   2. Replaces its `content_chunks` with a fresh chunk + embedding so the
//      RAG layer always reflects the current Silver state.
//
// This is the bridge from Silver → Gold. The phone-assistant-rag and any
// chat surface query `content_chunks` directly, so once this worker has
// processed an entity it is immediately available to the AI layer.

import { getServiceClient, jsonResponse, errorResponse } from "../_shared/supabase.ts";
import { readBatch, ack, deadLetter } from "../_shared/queue.ts";
import { embedText } from "../_shared/embeddings.ts";

const QUEUE                = "embed";
const VISIBILITY_TIMEOUT   = 120;
const BATCH_SIZE           = 10;
const MAX_ATTEMPTS_PER_MSG = 5;
const MAX_CHARS            = 6000;

interface EmbedMsg {
  organization_id: string;
  provider_id:     string;
  entity_type:     string;
  external_id:     string;
  run_id?:         string;
  title:           string;
  text:            string;
  metadata?:       Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const supabase = getServiceClient();
  const messages = await readBatch<EmbedMsg>(QUEUE, VISIBILITY_TIMEOUT, BATCH_SIZE);

  let processed = 0;
  let failed    = 0;

  for (const m of messages) {
    const msg = m.message;
    try {
      const text = (msg.text ?? "").slice(0, MAX_CHARS).trim();
      if (!text) {
        await ack(QUEUE, m.msg_id);
        continue;
      }

      // 1. Upsert source row keyed on (org, provider, external_id) via metadata.
      //    We use a deterministic title + metadata so re-runs are idempotent.
      const sourceKey = `${msg.provider_id}:${msg.entity_type}:${msg.external_id}`;
      const { data: existing, error: selErr } = await supabase
        .from("sources")
        .select("id")
        .eq("organization_id", msg.organization_id)
        .eq("source_type",     "entity")
        .contains("metadata",  { source_key: sourceKey })
        .limit(1);
      if (selErr) throw selErr;

      let sourceId: string;
      if (existing && existing.length > 0) {
        sourceId = existing[0].id as string;
        const { error: updErr } = await supabase
          .from("sources")
          .update({
            title:      msg.title,
            raw_text:   text,
            status:     "ready",
            word_count: text.split(/\s+/).length,
            metadata:   {
              source_key:  sourceKey,
              provider_id: msg.provider_id,
              entity_type: msg.entity_type,
              external_id: msg.external_id,
              ...(msg.metadata ?? {}),
            },
          })
          .eq("id", sourceId);
        if (updErr) throw updErr;
      } else {
        const { data: ins, error: insErr } = await supabase
          .from("sources")
          .insert({
            organization_id: msg.organization_id,
            title:           msg.title,
            source_type:     "entity",
            raw_text:        text,
            status:          "ready",
            word_count:      text.split(/\s+/).length,
            metadata: {
              source_key:  sourceKey,
              provider_id: msg.provider_id,
              entity_type: msg.entity_type,
              external_id: msg.external_id,
              ...(msg.metadata ?? {}),
            },
          })
          .select("id")
          .single();
        if (insErr) throw insErr;
        sourceId = ins!.id as string;
      }

      // 2. Embed the text. If embedding fails (e.g. no API key), we still
      //    keep the source row + chunk so FTS search remains usable.
      const embedding = await embedText(text);

      // 3. Replace existing chunks for this source.
      const { error: delErr } = await supabase
        .from("content_chunks")
        .delete()
        .eq("source_id", sourceId);
      if (delErr) throw delErr;

      const { error: chunkErr } = await supabase
        .from("content_chunks")
        .insert({
          organization_id: msg.organization_id,
          source_id:       sourceId,
          chunk_index:     0,
          chunk_text:      text,
          token_count:     Math.ceil(text.length / 4),
          char_start:      0,
          char_end:        text.length,
          embedding:       embedding ?? null,
          metadata: {
            provider_id: msg.provider_id,
            entity_type: msg.entity_type,
            external_id: msg.external_id,
          },
        });
      if (chunkErr) throw chunkErr;

      await ack(QUEUE, m.msg_id);
      processed++;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (m.read_ct >= MAX_ATTEMPTS_PER_MSG) {
        await deadLetter({
          queue:          QUEUE,
          msgId:          m.msg_id,
          organizationId: msg.organization_id,
          providerId:     msg.provider_id,
          runId:          msg.run_id,
          message:        msg,
          error,
          attemptCount:   m.read_ct,
        });
      }
      failed++;
    }
  }

  return jsonResponse({ processed, failed, batch: messages.length });
});
