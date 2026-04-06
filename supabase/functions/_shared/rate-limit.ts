// Token-bucket rate limiter, persisted in Postgres so multiple concurrent
// Edge Function invocations across regions share the same budget per
// (organization_id, provider_id). State lives in a tiny KV row that we
// update with optimistic locking via UPDATE ... WHERE updated_at = $old.
//
// This is intentionally simple: one bucket per (org, provider). Provider-
// global limits (e.g. shared OAuth app quota) can be modeled by passing
// a synthetic org_id like the zero UUID.

import { getServiceClient } from "./supabase.ts";

export interface RateLimitConfig {
  capacity:    number; // max tokens in bucket
  refillPerSec: number; // tokens added per second
}

interface BucketRow {
  organization_id: string;
  provider_id:     string;
  tokens:          number;
  updated_at:      string; // ISO
}

const TABLE = "rate_limit_buckets";

// Try to consume `cost` tokens. Returns the number of ms the caller should
// wait before retrying (0 = go ahead). Caller is responsible for sleeping.
export async function consumeTokens(
  organizationId: string,
  providerId:     string,
  cost:           number,
  config:         RateLimitConfig,
): Promise<number> {
  const supabase = getServiceClient();
  const now = Date.now();

  // Upsert-on-read: ensure a row exists.
  const { data: existing } = await supabase
    .from(TABLE)
    .select("organization_id, provider_id, tokens, updated_at")
    .eq("organization_id", organizationId)
    .eq("provider_id", providerId)
    .maybeSingle<BucketRow>();

  let tokens:    number;
  let updatedAt: string;

  if (!existing) {
    tokens    = config.capacity - cost;
    updatedAt = new Date(now).toISOString();
    const { error } = await supabase.from(TABLE).insert({
      organization_id: organizationId,
      provider_id:     providerId,
      tokens,
      updated_at:      updatedAt,
    });
    if (error) throw error;
    return tokens >= 0 ? 0 : waitMs(-tokens, config.refillPerSec);
  }

  // Refill based on elapsed time.
  const elapsedSec = (now - Date.parse(existing.updated_at)) / 1000;
  const refilled   = Math.min(config.capacity, existing.tokens + elapsedSec * config.refillPerSec);
  tokens    = refilled - cost;
  updatedAt = new Date(now).toISOString();

  // Optimistic update – if another worker raced us, retry once.
  const { error, count } = await supabase
    .from(TABLE)
    .update({ tokens, updated_at: updatedAt }, { count: "exact" })
    .eq("organization_id", organizationId)
    .eq("provider_id", providerId)
    .eq("updated_at", existing.updated_at);

  if (error) throw error;
  if (count === 0) {
    // Race lost – recurse once with a tiny delay.
    await new Promise((r) => setTimeout(r, 50));
    return consumeTokens(organizationId, providerId, cost, config);
  }

  return tokens >= 0 ? 0 : waitMs(-tokens, config.refillPerSec);
}

// Block until `cost` tokens are available, then return.
export async function acquire(
  organizationId: string,
  providerId:     string,
  cost:           number,
  config:         RateLimitConfig,
): Promise<void> {
  // Loop because refill may not give us everything in one go.
  // Cap iterations to avoid pathological loops.
  for (let i = 0; i < 20; i++) {
    const wait = await consumeTokens(organizationId, providerId, cost, config);
    if (wait === 0) return;
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error(`rate-limit: could not acquire ${cost} tokens for ${providerId}`);
}

function waitMs(deficit: number, refillPerSec: number): number {
  return Math.ceil((deficit / refillPerSec) * 1000);
}
