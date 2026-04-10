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
import { chunkText, chunkTabularText } from "../_shared/chunking.ts";

const QUEUE                = "embed";
const VISIBILITY_TIMEOUT   = 120;
const BATCH_SIZE           = 5;
const MAX_ATTEMPTS_PER_MSG = 5;
// Hard cap on total characters per source before chunking. Must stay within
// Edge Function memory + timeout limits: 50k chars ≈ 31 chunks ≈ 31 embed
// API calls, comfortably within the ~60s execution window.
const MAX_SOURCE_CHARS     = 50_000;

interface EmbedMsg {
  organization_id: string;
  provider_id:     string;
  entity_type:     string;
  external_id:     string;
  run_id?:         string;
  title:           string;
  text:            string;
  metadata?:       Record<string, unknown>;
  // Connector workers (gdrive/sharepoint) pass the existing connector source
  // id so we update that row in place instead of creating a parallel
  // source_type='entity' row. Without this the connector rows stay forever
  // on sync_status='queued' and the /quellen progress bar never advances.
  source_id?:      string;
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
      const text = (msg.text ?? "").slice(0, MAX_SOURCE_CHARS).trim();
      if (!text) {
        await ack(QUEUE, m.msg_id);
        continue;
      }

      // Detect tabular content (Markdown tables from xlsx extraction) and
      // use the structure-aware chunker so column headers repeat in every chunk.
      const isTabular = /^## Sheet:/m.test(text) && text.includes("\n|");
      const chunks = isTabular
        ? chunkTabularText(text, { targetTokens: 400 })
        : chunkText(text, { targetTokens: 400, overlapTokens: 50 });
      if (chunks.length === 0) {
        await ack(QUEUE, m.msg_id);
        continue;
      }

      // 1. Resolve the target sources row.
      //    a) Connector path: msg.source_id is set by worker-normalize for
      //       gdrive/sharepoint. Update that connector row in place and flip
      //       both `status` (used by /sources) and `sync_status` (used by
      //       /quellen) to `ready`.
      //    b) Entity path: legacy callers (calendar etc.) carry no source_id;
      //       we keep the metadata.source_key lookup and create a parallel
      //       source_type='entity' row.
      const sourceKey = `${msg.provider_id}:${msg.entity_type}:${msg.external_id}`;
      const wordCount = text.split(/\s+/).length;
      let sourceId: string;

      if (msg.source_id) {
        sourceId = msg.source_id;
        // Only stage title/text/word_count here. status/sync_status flip to
        // 'ready'/'success' happens below, after embeddings actually succeeded.
        const { error: updErr } = await supabase
          .from("sources")
          .update({
            title:      msg.title,
            raw_text:   text,
            word_count: wordCount,
          })
          .eq("id", sourceId)
          .eq("organization_id", msg.organization_id);
        if (updErr) throw updErr;
      } else {
        const { data: existing, error: selErr } = await supabase
          .from("sources")
          .select("id")
          .eq("organization_id", msg.organization_id)
          .eq("source_type",     "entity")
          .contains("metadata",  { source_key: sourceKey })
          .limit(1);
        if (selErr) throw selErr;

        if (existing && existing.length > 0) {
          sourceId = existing[0].id as string;
          const { error: updErr } = await supabase
            .from("sources")
            .update({
              title:      msg.title,
              raw_text:   text,
              status:     "ready",
              word_count: wordCount,
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
              word_count:      wordCount,
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
      }

      // 2. Embed each chunk in parallel. Any failure must be loud — silently
      //    persisting embedding=null masks rate limits / API key issues and
      //    leaves the source flagged as "ready" while RAG search is broken.
      const embeddings: number[][] = [];
      for (const c of chunks) {
        embeddings.push(await embedText(c.text) as number[]);
      }

      // 3. Replace existing chunks for this source.
      const { error: delErr } = await supabase
        .from("content_chunks")
        .delete()
        .eq("source_id", sourceId);
      if (delErr) throw delErr;

      const rows = chunks.map((c, i) => ({
        organization_id: msg.organization_id,
        source_id:       sourceId,
        chunk_index:     c.index,
        chunk_text:      c.text,
        token_count:     c.tokenCount,
        char_start:      c.charStart,
        char_end:        c.charEnd,
        embedding:       embeddings[i] ?? null,
        metadata: {
          provider_id: msg.provider_id,
          entity_type: msg.entity_type,
          external_id: msg.external_id,
          ...(c.sheetName ? {
            content_format: "tabular",
            sheet_name:     c.sheetName,
            row_start:      c.rowStart,
            row_end:        c.rowEnd,
          } : {}),
        },
      }));

      const { error: chunkErr } = await supabase
        .from("content_chunks")
        .insert(rows);
      if (chunkErr) throw chunkErr;

      // Embeddings persisted — flip the connector source to ready/success.
      if (msg.source_id) {
        await supabase
          .from("sources")
          .update({ status: "ready", sync_status: "success" })
          .eq("id", sourceId)
          .eq("organization_id", msg.organization_id);
      }

      await ack(QUEUE, m.msg_id);
      processed++;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error("[worker-embed] failed", { msg_id: m.msg_id, source_id: msg.source_id, attempt: m.read_ct, error: error.message });
      if (m.read_ct >= MAX_ATTEMPTS_PER_MSG) {
        // Permanent failure — mark the connector source as error so the user
        // sees it in /quellen instead of stuck on "wartet" forever.
        if (msg.source_id) {
          await supabase
            .from("sources")
            .update({ sync_status: "error" })
            .eq("id", msg.source_id)
            .eq("organization_id", msg.organization_id);
        }
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
