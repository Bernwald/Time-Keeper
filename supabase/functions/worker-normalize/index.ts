// worker-normalize
//
// Drains the `normalize` pgmq queue. For each message, looks up the matching
// raw_events row and upserts a typed entity into the appropriate Silver
// table. Currently knows how to normalize:
//   * google_calendar / calendar_event → entities_calendar_events
//
// New entity types are added by extending the NORMALIZERS map. Anything
// unknown is acked silently (the raw row is preserved for later replay).

import { getServiceClient, jsonResponse, errorResponse } from "../_shared/supabase.ts";
import { readBatch, ack, deadLetter, enqueue } from "../_shared/queue.ts";
import { flattenPayloadToText } from "../_shared/normalize.ts";

const QUEUE                 = "normalize";
const VISIBILITY_TIMEOUT    = 60;   // seconds
const BATCH_SIZE            = 25;
const MAX_ATTEMPTS_PER_MSG  = 5;

interface NormalizeMsg {
  organization_id: string;
  provider_id:     string;
  run_id:          string;
  external_id:     string;
  entity_type:     string;
  payload_hash:    string;
}

type Normalizer = (
  msg: NormalizeMsg,
  payload: Record<string, unknown>,
) => Promise<void>;

const NORMALIZERS: Record<string, Normalizer> = {
  "google_calendar:calendar_event": normalizeGoogleCalendarEvent,
  "sharepoint:drive_item":          normalizeDriveItem,
  "google_drive:drive_item":        normalizeDriveItem,
};

// Connector drive items: upsert into the sources table via the
// connector-aware RPC, then enqueue an embed job if content changed.
async function normalizeDriveItem(
  msg: NormalizeMsg,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabase = getServiceClient();

  // SharePoint payloads carry the DriveItem fields directly; gdrive change
  // payloads wrap them under `file`.
  const file = (payload.file as Record<string, unknown> | undefined) ?? payload;
  const isDeleted =
    Boolean((payload as { removed?: boolean }).removed) ||
    Boolean((payload as { deleted?: unknown }).deleted) ||
    Boolean((file as { trashed?: boolean }).trashed);

  const externalId = (file.id as string) ?? msg.external_id;
  const title = (file.name as string) ?? `${msg.provider_id} ${externalId}`;
  const etag =
    (file.eTag as string) ??
    (file.cTag as string) ??
    (file.md5Checksum as string) ??
    (file.modifiedTime as string) ??
    (file.lastModifiedDateTime as string) ??
    null;
  const mimeType =
    (file.mimeType as string) ??
    ((file.file as Record<string, unknown> | undefined)?.mimeType as string | undefined) ??
    null;
  const sourceUrl =
    (file.webUrl as string) ??
    (file.webViewLink as string) ??
    null;

  if (isDeleted) {
    // Soft-delete by external_id lookup
    const { data: existing } = await supabase
      .from("sources")
      .select("id")
      .eq("connector_type", msg.provider_id === "sharepoint" ? "sharepoint" : "gdrive")
      .eq("external_id", externalId)
      .eq("organization_id", msg.organization_id)
      .maybeSingle<{ id: string }>();
    if (existing?.id) {
      await supabase.rpc("soft_delete_source", { p_source_id: existing.id });
    }
    return;
  }

  const connectorType = msg.provider_id === "sharepoint" ? "sharepoint" : "gdrive";
  const { data: upsert, error } = await supabase.rpc("upsert_connector_source", {
    p_org_id: msg.organization_id,
    p_connector_type: connectorType,
    p_external_id: externalId,
    p_title: title,
    p_etag: etag,
    p_mime_type: mimeType,
    p_source_url: sourceUrl,
    p_metadata: { provider: msg.provider_id, run_id: msg.run_id },
  });
  if (error) throw error;

  const upsertRow = (Array.isArray(upsert) ? upsert[0] : upsert) as
    | { source_id: string; was_changed: boolean }
    | null;
  if (!upsertRow?.was_changed) return;

  // Enqueue embed job. Use the pre-extracted text if the connector pulled it,
  // otherwise fall back to a stub so the file at least appears in search.
  const extractedText = (payload._extracted_text as string | null) ?? null;
  const text =
    extractedText && extractedText.trim().length > 0
      ? extractedText
      : `Datei: ${title}\nTyp: ${mimeType ?? "unbekannt"}\nQuelle: ${sourceUrl ?? "—"}`;

  await enqueue("embed", {
    organization_id: msg.organization_id,
    provider_id: msg.provider_id,
    entity_type: msg.entity_type,
    external_id: externalId,
    run_id: msg.run_id,
    title,
    text,
    source_id: upsertRow.source_id,
  });
}

async function normalizeGoogleCalendarEvent(
  msg: NormalizeMsg,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabase = getServiceClient();

  const start = (payload.start as Record<string, unknown> | undefined)?.dateTime
             ?? (payload.start as Record<string, unknown> | undefined)?.date;
  const end   = (payload.end   as Record<string, unknown> | undefined)?.dateTime
             ?? (payload.end   as Record<string, unknown> | undefined)?.date;
  const organizer = payload.organizer as Record<string, unknown> | undefined;

  const { error } = await supabase
    .from("entities_calendar_events")
    .upsert({
      organization_id: msg.organization_id,
      provider_id:     msg.provider_id,
      external_id:     msg.external_id,
      payload_hash:    msg.payload_hash,
      summary:         (payload.summary as string)     ?? null,
      description:     (payload.description as string) ?? null,
      starts_at:       start ? new Date(start as string).toISOString() : null,
      ends_at:         end   ? new Date(end   as string).toISOString() : null,
      location:        (payload.location as string) ?? null,
      organizer_email: (organizer?.email as string) ?? null,
      attendees:       payload.attendees ?? [],
      raw:             payload,
      updated_at:      new Date().toISOString(),
    }, { onConflict: "organization_id,provider_id,external_id" });

  if (error) throw error;

  // Hand off to the embed worker so the entity lands in the RAG layer.
  const summary     = (payload.summary as string)     ?? "";
  const description = (payload.description as string) ?? "";
  const location    = (payload.location as string)    ?? "";
  const text = [
    summary,
    start ? `Beginn: ${start}` : "",
    end   ? `Ende: ${end}`     : "",
    location ? `Ort: ${location}` : "",
    description,
  ].filter(Boolean).join("\n").trim();

  if (text) {
    await enqueue("embed", {
      organization_id: msg.organization_id,
      provider_id:     msg.provider_id,
      entity_type:     msg.entity_type,
      external_id:     msg.external_id,
      run_id:          msg.run_id,
      title:           summary || `Termin ${msg.external_id}`,
      text,
    });
  }
}

Deno.serve(async (req) => {
  try {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const supabase = getServiceClient();
  const messages = await readBatch<NormalizeMsg>(QUEUE, VISIBILITY_TIMEOUT, BATCH_SIZE);

  let processed = 0;
  let failed    = 0;

  for (const m of messages) {
    const msg = m.message;
    try {
      // Look up the raw payload by (org, provider, external_id, payload_hash).
      const { data: rawRows, error: rawErr } = await supabase
        .from("raw_events")
        .select("payload")
        .eq("organization_id", msg.organization_id)
        .eq("provider_id",     msg.provider_id)
        .eq("external_id",     msg.external_id)
        .eq("payload_hash",    msg.payload_hash)
        .order("fetched_at", { ascending: false })
        .limit(1);

      if (rawErr) throw rawErr;
      if (!rawRows || rawRows.length === 0) {
        // Raw row not found — likely already pruned. Ack and move on.
        await ack(QUEUE, m.msg_id);
        continue;
      }

      const payload    = rawRows[0].payload as Record<string, unknown>;
      const key        = `${msg.provider_id}:${msg.entity_type}`;
      const normalizer = NORMALIZERS[key];
      if (normalizer) {
        await normalizer(msg, payload);
      } else {
        // Unknown type — fall back to a generic flatten so the data still
        // reaches the RAG layer instead of being silently dropped.
        const fallbackTitle = `${msg.entity_type} ${msg.external_id}`;
        const { title, text } = flattenPayloadToText(payload, fallbackTitle);
        if (text) {
          await enqueue("embed", {
            organization_id: msg.organization_id,
            provider_id:     msg.provider_id,
            entity_type:     msg.entity_type,
            external_id:     msg.external_id,
            run_id:          msg.run_id,
            title,
            text,
          });
        }
      }
      await ack(QUEUE, m.msg_id);
      processed++;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // pgmq read_ct counts attempts. After MAX_ATTEMPTS, dead-letter it.
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
      // Otherwise: don't ack — visibility timeout expires, msg becomes
      // visible again, next worker tick retries it.
      failed++;
    }
  }

  return jsonResponse({ processed, failed, batch: messages.length });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error("[worker-normalize] FATAL", err.message, err.stack);
    return jsonResponse({ error: err.message, stack: err.stack }, 500);
  }
});
