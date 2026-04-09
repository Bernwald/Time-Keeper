// connector-gdrive
//
// Google Drive ingest via Drive Changes API.

import { getServiceClient, jsonResponse, errorResponse } from "../_shared/supabase.ts";
import { runSync, SyncRecord } from "../_shared/worker.ts";
import {
  refreshGoogleAccessToken,
  listDriveChanges,
  downloadDriveFileText,
  listAllDriveFileIds,
} from "../_shared/google-drive.ts";

const PROVIDER_ID = "google_drive";

interface IntegrationRow {
  organization_id: string;
  credentials: { refresh_token?: string; access_token?: string; token_expires_at?: string };
  config: Record<string, unknown> & { page_token?: string };
}

async function getValidAccessToken(row: IntegrationRow): Promise<string> {
  const c = row.credentials ?? {};
  if (c.access_token && c.token_expires_at) {
    if (Date.parse(c.token_expires_at) - Date.now() > 60_000) return c.access_token;
  }
  if (!c.refresh_token) throw new Error("google_drive integration has no refresh_token");
  const refreshed = await refreshGoogleAccessToken(c.refresh_token, row.organization_id);
  if (!refreshed) throw new Error("google token refresh failed");

  const supabase = getServiceClient();
  await supabase
    .from("organization_integrations")
    .update({
      credentials: {
        ...c,
        access_token: refreshed.access_token,
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
  if (!row) throw new Error("no active google_drive integration");

  const accessToken = await getValidAccessToken(row);
  const startToken = mode === "initial" ? undefined : row.config?.page_token;

  return await runSync({
    organizationId: orgId,
    providerId: PROVIDER_ID,
    trigger: "manual",
    rateLimit: { capacity: 60, refillPerSec: 8 },
    syncFn: async () => {
      const { changes, nextPageToken } = await listDriveChanges(accessToken, startToken);
      if (nextPageToken) {
        await supabase
          .from("organization_integrations")
          .update({ config: { ...(row.config ?? {}), page_token: nextPageToken } })
          .eq("organization_id", orgId)
          .eq("provider_id", PROVIDER_ID);
      }

      const records: SyncRecord[] = [];
      for (const ch of changes) {
        const fileId = ch.fileId ?? ch.file?.id;
        if (!fileId) continue;
        let text: string | null = null;
        if (!ch.removed && !ch.file?.trashed) {
          try {
            text = await downloadDriveFileText(accessToken, fileId, ch.file?.mimeType);
          } catch (err) {
            console.warn("[gdrive] download failed:", fileId, err);
          }
        }
        // Sanitize: Postgres JSONB rejects \u0000 (null bytes). Binary-ish
        // files (xlsx, docx, pdf) sometimes surface them in metadata.
        const cleanPayload = JSON.parse(
          JSON.stringify({ ...ch, _extracted_text: text }).replace(/\\u0000/g, ""),
        ) as Record<string, unknown>;
        records.push({
          external_id: fileId,
          entity_type: "drive_item",
          payload: cleanPayload,
        });
      }
      return records;
    },
  });
}

// Reconcile pass: pull a fresh snapshot of every visible Drive file id and
// soft-delete every source whose external_id is no longer in that set.
// Used by the daily cron and the manual "Aufräumen" button on /quellen.
async function reconcileOrg(orgId: string): Promise<{ removed: number }> {
  const supabase = getServiceClient();
  const { data: row, error } = await supabase
    .from("organization_integrations")
    .select("organization_id, credentials, config")
    .eq("organization_id", orgId)
    .eq("provider_id", PROVIDER_ID)
    .eq("status", "active")
    .maybeSingle<IntegrationRow>();
  if (error) throw error;
  if (!row) throw new Error("no active google_drive integration");

  const accessToken = await getValidAccessToken(row);
  const ids = await listAllDriveFileIds(accessToken);
  const { data: removed, error: rpcErr } = await supabase.rpc("reconcile_drive_sources", {
    p_org_id: orgId,
    p_connector: "gdrive",
    p_existing_ids: ids,
  });
  if (rpcErr) throw rpcErr;
  return { removed: (removed as number) ?? 0 };
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

  if (body.organization_id) {
    try {
      const result =
        action === "reconcile"
          ? await reconcileOrg(body.organization_id)
          : await syncOrg(
              body.organization_id,
              action === "initial-sync" ? "initial" : "delta",
            );
      return jsonResponse(result);
    } catch (err) {
      return errorResponse(err instanceof Error ? err.message : String(err), 500);
    }
  }

  const { data: rows } = await supabase
    .from("organization_integrations")
    .select("organization_id")
    .eq("provider_id", PROVIDER_ID)
    .eq("status", "active");

  const results: unknown[] = [];
  for (const r of (rows ?? []) as { organization_id: string }[]) {
    try {
      if (action === "reconcile") {
        results.push({ organization_id: r.organization_id, ...(await reconcileOrg(r.organization_id)) });
      } else {
        results.push(await syncOrg(r.organization_id, "delta"));
      }
    } catch (err) {
      results.push({ organization_id: r.organization_id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return jsonResponse({ runs: results });
});
