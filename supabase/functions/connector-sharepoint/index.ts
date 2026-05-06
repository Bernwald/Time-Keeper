// connector-sharepoint
//
// SharePoint / OneDrive ingest via Microsoft Graph delta feed.
// Modes:
//   POST { action: "initial-sync", organization_id: "uuid" }
//   POST { action: "delta-sync",   organization_id?: "uuid", trigger?: "cron" }
// In delta-sync without organization_id we iterate every active SharePoint
// integration (cron path).

import { getServiceClient, jsonResponse, errorResponse } from "../_shared/supabase.ts";
import { runSync, SyncRecord } from "../_shared/worker.ts";
import {
  refreshMicrosoftAccessToken,
  listDriveItemsDelta,
  downloadDriveItemText,
  type DriveItem,
} from "../_shared/microsoft-graph.ts";

const PROVIDER_ID = "sharepoint";

interface IntegrationRow {
  organization_id: string;
  credentials: { refresh_token?: string; access_token?: string; token_expires_at?: string };
  config: Record<string, unknown> & { delta_link?: string };
}

async function getValidAccessToken(row: IntegrationRow): Promise<string> {
  const c = row.credentials ?? {};
  if (c.access_token && c.token_expires_at) {
    if (Date.parse(c.token_expires_at) - Date.now() > 60_000) return c.access_token;
  }
  if (!c.refresh_token) throw new Error("sharepoint integration has no refresh_token");

  const supabase = getServiceClient();
  let refreshed: Awaited<ReturnType<typeof refreshMicrosoftAccessToken>>;
  try {
    refreshed = await refreshMicrosoftAccessToken(c.refresh_token, row.organization_id);
  } catch (err) {
    // Park the integration so cron stops retrying every 5 min and the UI
    // can flip to "Erneut verbinden". The error_message reaches /quellen
    // through the integration row.
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("organization_integrations")
      .update({ status: "error", error_message: message })
      .eq("organization_id", row.organization_id)
      .eq("provider_id", PROVIDER_ID);
    throw err;
  }

  await supabase
    .from("organization_integrations")
    .update({
      credentials: {
        ...c,
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? c.refresh_token,
        token_expires_at: refreshed.expires_at.toISOString(),
      },
    })
    .eq("organization_id", row.organization_id)
    .eq("provider_id", PROVIDER_ID);

  return refreshed.access_token;
}

async function syncOrg(orgId: string, mode: "initial" | "delta"): Promise<unknown> {
  const supabase = getServiceClient();
  const { data: row, error } = await supabase
    .from("organization_integrations")
    .select("organization_id, credentials, config")
    .eq("organization_id", orgId)
    .eq("provider_id", PROVIDER_ID)
    .eq("status", "active")
    .maybeSingle<IntegrationRow>();

  if (error) throw error;
  if (!row) throw new Error("no active sharepoint integration");

  const accessToken = await getValidAccessToken(row);
  const startLink = mode === "initial" ? undefined : row.config?.delta_link;

  return await runSync({
    organizationId: orgId,
    providerId: PROVIDER_ID,
    trigger: "manual",
    rateLimit: { capacity: 60, refillPerSec: 8 },
    syncFn: async () => {
      const { items, deltaLink } = await listDriveItemsDelta(accessToken, startLink);

      // Persist new delta link for next run.
      if (deltaLink) {
        await supabase
          .from("organization_integrations")
          .update({ config: { ...(row.config ?? {}), delta_link: deltaLink } })
          .eq("organization_id", orgId)
          .eq("provider_id", PROVIDER_ID);
      }

      const records: SyncRecord[] = [];
      for (const item of items) {
        if (item.folder) continue; // skip folders
        // Pre-extract text payload for text-like files. Binary files still
        // get a record (so they show up as 'sync_status=error' in the UI).
        let text: string | null = null;
        let formulaWarnings: Record<string, number> | undefined;
        if (!item.deleted) {
          try {
            const extracted = await downloadDriveItemText(accessToken, item.id, item.file?.mimeType);
            if (extracted) {
              text = extracted.text;
              formulaWarnings = extracted.formulaWarnings;
            }
          } catch (err) {
            console.warn("[sharepoint] download failed:", item.id, err);
          }
        }
        records.push({
          external_id: item.id,
          entity_type: "drive_item",
          payload: {
            ...item,
            _extracted_text: text,
            _formula_warnings: formulaWarnings ?? null,
          } as Record<string, unknown>,
        });
      }
      return records;
    },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: { action?: string; organization_id?: string; trigger?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const action = body.action ?? "delta-sync";
  const supabase = getServiceClient();

  // Per-org explicit
  if (body.organization_id) {
    try {
      const result = await syncOrg(
        body.organization_id,
        action === "initial-sync" ? "initial" : "delta",
      );
      return jsonResponse(result);
    } catch (err) {
      return errorResponse(err instanceof Error ? err.message : String(err), 500);
    }
  }

  // Cron path: every active org with this provider gets a delta sync
  const { data: rows } = await supabase
    .from("organization_integrations")
    .select("organization_id")
    .eq("provider_id", PROVIDER_ID)
    .eq("status", "active");

  const results: unknown[] = [];
  for (const r of (rows ?? []) as { organization_id: string }[]) {
    try {
      results.push(await syncOrg(r.organization_id, "delta"));
    } catch (err) {
      results.push({ organization_id: r.organization_id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return jsonResponse({ runs: results });
});
