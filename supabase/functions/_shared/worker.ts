// Generic sync-worker wrapper.
//
// Wraps a sync function with the full pipeline lifecycle:
//   1. start_integration_run        – open observability row
//   2. acquire rate-limit tokens    – respect provider quota
//   3. call user-supplied syncFn    – under withRetry
//   4. write payloads to raw_events – idempotent on payload_hash
//   5. enqueue downstream jobs      – into the `normalize` queue
//   6. finish_integration_run       – close observability row
//   7. on hard failure: dead-letter – land in job_failures
//
// A sync function only needs to know how to talk to its provider's API and
// hand back a list of records. Everything else is handled here.

import { getServiceClient } from "./supabase.ts";
import { withRetry, RetryOptions } from "./retry.ts";
import { acquire, RateLimitConfig } from "./rate-limit.ts";
import { enqueue, QueueName } from "./queue.ts";

export interface SyncRecord {
  external_id:  string;
  entity_type:  string;
  payload:      Record<string, unknown>;
}

export interface SyncContext {
  organizationId: string;
  providerId:     string;
  runId:          string;
}

export type SyncFn = (ctx: SyncContext) => Promise<SyncRecord[]>;

export interface RunSyncOptions {
  organizationId:  string;
  providerId:      string;
  trigger?:        "manual" | "cron" | "webhook" | "replay";
  rateLimit?:      RateLimitConfig;
  retry?:          RetryOptions;
  downstreamQueue?: QueueName; // default "normalize"
  syncFn:          SyncFn;
}

export interface RunSyncResult {
  runId:         string;
  status:        "success" | "partial" | "failed";
  recordsIn:     number;
  recordsOk:     number;
  recordsFailed: number;
  error?:        string;
}

// Stable JSON hash for idempotency. Sorts keys recursively so semantically
// identical payloads collapse to the same hash regardless of property order.
async function hashPayload(payload: unknown): Promise<string> {
  const stable = stableStringify(payload);
  const buf    = new TextEncoder().encode(stable);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Best-effort human-readable error message. Supabase PostgrestError is a
// plain object, so `String(err)` collapses to "[object Object]" which is
// useless in job_failures. Pull out message/code/details/hint when present.
function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    const parts = [o.message, o.code, o.details, o.hint].filter(Boolean);
    if (parts.length > 0) return parts.join(" | ");
    try { return JSON.stringify(err); } catch { return String(err); }
  }
  return String(err);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return "{" + keys
    .map((k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k]))
    .join(",") + "}";
}

export async function runSync(opts: RunSyncOptions): Promise<RunSyncResult> {
  const supabase = getServiceClient();
  const trigger  = opts.trigger ?? "cron";
  const queue    = opts.downstreamQueue ?? "normalize";

  // 1. open run
  const { data: runId, error: startErr } = await supabase.rpc("start_integration_run", {
    p_org_id:      opts.organizationId,
    p_provider_id: opts.providerId,
    p_trigger:     trigger,
  });
  if (startErr || !runId) throw startErr ?? new Error("start_integration_run returned no id");

  const ctx: SyncContext = {
    organizationId: opts.organizationId,
    providerId:     opts.providerId,
    runId:          runId as string,
  };

  let records:       SyncRecord[] = [];
  let recordsOk      = 0;
  let recordsFailed  = 0;
  let hardError:     Error | undefined;

  try {
    // 2. respect provider quota before fetching
    if (opts.rateLimit) {
      await acquire(opts.organizationId, opts.providerId, 1, opts.rateLimit);
    }

    // 3. user sync function under retry
    records = await withRetry(() => opts.syncFn(ctx), opts.retry);

    // 4. + 5. persist + fan-out
    for (const rec of records) {
      try {
        const payload_hash = await hashPayload(rec.payload);

        const { error: insertErr } = await supabase.from("raw_events").insert({
          organization_id: opts.organizationId,
          provider_id:     opts.providerId,
          run_id:          runId,
          external_id:     rec.external_id,
          entity_type:     rec.entity_type,
          payload:         rec.payload,
          payload_hash,
        });

        // Unique-violation = duplicate, treat as success (idempotent).
        if (insertErr && insertErr.code !== "23505") throw insertErr;

        await enqueue(queue, {
          organization_id: opts.organizationId,
          provider_id:     opts.providerId,
          run_id:          runId,
          external_id:     rec.external_id,
          entity_type:     rec.entity_type,
          payload_hash,
        });

        recordsOk++;
      } catch (recErr) {
        recordsFailed++;
        await supabase.from("job_failures").insert({
          organization_id: opts.organizationId,
          provider_id:     opts.providerId,
          run_id:          runId,
          queue_name:      queue,
          message:         { external_id: rec.external_id, entity_type: rec.entity_type },
          error_message:   formatError(recErr),
          error_stack:     recErr instanceof Error ? recErr.stack ?? null : null,
          attempt_count:   1,
        });
      }
    }
  } catch (err) {
    hardError = err instanceof Error ? err : new Error(String(err));
  }

  // 6. close run
  const status: "success" | "partial" | "failed" =
    hardError                              ? "failed"  :
    recordsFailed > 0 && recordsOk > 0     ? "partial" :
    recordsFailed > 0                      ? "failed"  :
                                             "success";

  await supabase.rpc("finish_integration_run", {
    p_run_id:         runId,
    p_status:         status,
    p_records_in:     records.length,
    p_records_ok:     recordsOk,
    p_records_failed: recordsFailed,
    p_error_message:  hardError?.message ?? null,
  });

  return {
    runId:         runId as string,
    status,
    recordsIn:     records.length,
    recordsOk,
    recordsFailed,
    error:         hardError?.message,
  };
}
