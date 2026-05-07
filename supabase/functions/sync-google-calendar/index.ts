// sync-google-calendar
//
// Pilot integration on the new ingest pipeline. Pulls calendar events for an
// organization into raw_events and fans out normalize jobs. Triggered by
// pg_cron (schedule defined in a follow-up migration) or manually via POST.
//
// Body: { "organization_id": "uuid", "trigger": "manual" | "cron" }
//
// This function does NOT replace the existing _shared/google-calendar.ts
// helper used by the phone assistant — that one stays as a transactional
// API helper for booking flows. This function is the *ingest* path.

import { getServiceClient, jsonResponse, errorResponse } from "../_shared/supabase.ts";
import { fetchWithRetry } from "../_shared/retry.ts";
import { runSync, SyncRecord } from "../_shared/worker.ts";
import { refreshAccessToken } from "../_shared/google-calendar.ts";

const PROVIDER_ID         = "google_calendar";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";

// Default sync window. Past defaults to one full year so the chat can answer
// "wann war Termin X" for anything in the last 12 months. Override per org via
// organization_integrations.config: { window_days_back, window_days_forward }.
const DEFAULT_WINDOW_DAYS_BACK    = 365;
const DEFAULT_WINDOW_DAYS_FORWARD = 180;

interface SyncRequest {
  organization_id:      string;
  trigger?:             "manual" | "cron";
  window_days_back?:    number;
  window_days_forward?: number;
}

interface CalendarRow {
  organization_id:  string;
  calendar_id:      string;
  refresh_token:    string | null;
  access_token:     string | null;
  token_expires_at: string | null;
}

async function getValidAccessToken(row: CalendarRow): Promise<string> {
  // Reuse cached token if it's still valid for at least 60 seconds.
  if (row.access_token && row.token_expires_at) {
    const expiresAt = Date.parse(row.token_expires_at);
    if (expiresAt - Date.now() > 60_000) return row.access_token;
  }
  if (!row.refresh_token) {
    throw new Error("calendar_integrations row has no refresh_token");
  }

  // refreshAccessToken throws with the concrete Google error_description on
  // failure (e.g. invalid_grant). Let it propagate.
  const refreshed = await refreshAccessToken(row.refresh_token, row.organization_id);

  // Persist the new token for the next invocation.
  const supabase = getServiceClient();
  await supabase
    .from("calendar_integrations")
    .update({
      access_token:     refreshed.access_token,
      token_expires_at: refreshed.expires_at.toISOString(),
    })
    .eq("organization_id", row.organization_id);

  return refreshed.access_token;
}

async function fetchEvents(
  accessToken: string,
  calendarId:  string,
  daysBack:    number,
  daysForward: number,
): Promise<SyncRecord[]> {
  const timeMin = new Date(Date.now() - daysBack    * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + daysForward * 24 * 60 * 60 * 1000).toISOString();

  const records: SyncRecord[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin",      timeMin);
    url.searchParams.set("timeMax",      timeMax);
    // singleEvents=false → recurring series come back as ONE master event
    // with a `recurrence` rule, instead of being expanded into one row per
    // occurrence. Avoids polluting sources/raw_events with duplicates.
    url.searchParams.set("singleEvents", "false");
    url.searchParams.set("maxResults",   "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();

    for (const ev of (data.items ?? []) as Array<Record<string, unknown>>) {
      const id = ev.id as string | undefined;
      if (!id) continue;
      records.push({
        external_id: id,
        entity_type: "calendar_event",
        payload:     ev,
      });
    }
    pageToken = data.nextPageToken as string | undefined;
  } while (pageToken);

  return records;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: SyncRequest;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }
  if (!body.organization_id) return errorResponse("organization_id required", 400);

  const supabase = getServiceClient();
  const { data: row, error: rowErr } = await supabase
    .from("calendar_integrations")
    .select("organization_id, calendar_id, refresh_token, access_token, token_expires_at")
    .eq("organization_id", body.organization_id)
    .eq("status", "active")
    .maybeSingle<CalendarRow>();

  if (rowErr)  return errorResponse(rowErr.message, 500);
  if (!row)    return errorResponse("No active calendar_integrations row", 404);

  // Resolve sync window: explicit body params win, then per-org integration
  // config, then sensible defaults. Manual backfills can pass huge windows.
  const { data: integ } = await supabase
    .from("organization_integrations")
    .select("config")
    .eq("organization_id", body.organization_id)
    .eq("provider_id",     PROVIDER_ID)
    .maybeSingle<{ config: Record<string, unknown> | null }>();

  const cfg         = integ?.config ?? {};
  const daysBack    = body.window_days_back
                    ?? (cfg.window_days_back as number | undefined)
                    ?? DEFAULT_WINDOW_DAYS_BACK;
  const daysForward = body.window_days_forward
                    ?? (cfg.window_days_forward as number | undefined)
                    ?? DEFAULT_WINDOW_DAYS_FORWARD;

  try {
    const result = await runSync({
      organizationId: body.organization_id,
      providerId:     PROVIDER_ID,
      trigger:        body.trigger ?? "manual",
      // Google Calendar quota: ~600 reads / minute / user. Be conservative.
      rateLimit: { capacity: 60, refillPerSec: 8 },
      retry:     { maxAttempts: 4, baseDelayMs: 750 },
      syncFn: async () => {
        const accessToken = await getValidAccessToken(row);
        return fetchEvents(accessToken, row.calendar_id, daysBack, daysForward);
      },
    });

    return jsonResponse(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(msg, 500);
  }
});
