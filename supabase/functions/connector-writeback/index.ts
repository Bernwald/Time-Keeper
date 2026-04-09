// connector-writeback
//
// PATCH/DELETE a connector-sourced file in its origin system, then
// invalidate the local chunks so the next sync rebuilds them.
// Body: { source_id: "uuid", action: "rename" | "delete", new_name?: string }

import { getServiceClient, jsonResponse, errorResponse } from "../_shared/supabase.ts";
import {
  refreshMicrosoftAccessToken,
  patchDriveItem,
  deleteDriveItem,
} from "../_shared/microsoft-graph.ts";
import {
  refreshGoogleAccessToken,
  patchDriveFile,
  deleteDriveFile,
} from "../_shared/google-drive.ts";

interface IntegrationCreds {
  refresh_token?: string;
  access_token?: string;
  token_expires_at?: string;
}

async function getAccessToken(
  orgId: string,
  providerId: "sharepoint" | "google_drive",
): Promise<string> {
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("organization_integrations")
    .select("credentials")
    .eq("organization_id", orgId)
    .eq("provider_id", providerId)
    .eq("status", "active")
    .maybeSingle<{ credentials: IntegrationCreds }>();
  const c = data?.credentials ?? {};
  if (c.access_token && c.token_expires_at && Date.parse(c.token_expires_at) - Date.now() > 60_000) {
    return c.access_token;
  }
  if (!c.refresh_token) throw new Error(`${providerId} not connected`);

  const refreshed =
    providerId === "sharepoint"
      ? await refreshMicrosoftAccessToken(c.refresh_token, orgId)
      : await refreshGoogleAccessToken(c.refresh_token, orgId);
  if (!refreshed) throw new Error(`${providerId} token refresh failed`);

  await supabase
    .from("organization_integrations")
    .update({
      credentials: {
        ...c,
        access_token: refreshed.access_token,
        token_expires_at: refreshed.expires_at.toISOString(),
      },
    })
    .eq("organization_id", orgId)
    .eq("provider_id", providerId);

  return refreshed.access_token;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  let body: { source_id?: string; action?: string; new_name?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  if (!body.source_id || !body.action) {
    return errorResponse("source_id and action required", 400);
  }

  const supabase = getServiceClient();
  const { data: src, error: srcErr } = await supabase
    .from("sources")
    .select("id, organization_id, connector_type, external_id")
    .eq("id", body.source_id)
    .maybeSingle<{ id: string; organization_id: string; connector_type: string; external_id: string }>();
  if (srcErr) return errorResponse(srcErr.message, 500);
  if (!src) return errorResponse("source not found", 404);
  if (!src.external_id) return errorResponse("source is not connector-sourced", 400);

  const providerId = src.connector_type === "sharepoint" ? "sharepoint" : "google_drive";

  try {
    const accessToken = await getAccessToken(src.organization_id, providerId);

    let ok = false;
    if (body.action === "delete") {
      ok =
        providerId === "sharepoint"
          ? await deleteDriveItem(accessToken, src.external_id)
          : await deleteDriveFile(accessToken, src.external_id);
      if (ok) {
        await supabase.rpc("soft_delete_source", { p_source_id: src.id });
      }
    } else if (body.action === "rename") {
      if (!body.new_name) return errorResponse("new_name required", 400);
      ok =
        providerId === "sharepoint"
          ? await patchDriveItem(accessToken, src.external_id, { name: body.new_name })
          : await patchDriveFile(accessToken, src.external_id, { name: body.new_name });
      if (ok) {
        await supabase.from("sources").update({ title: body.new_name }).eq("id", src.id);
        await supabase.rpc("invalidate_source_chunks", { p_source_id: src.id });
      }
    } else {
      return errorResponse(`unknown action: ${body.action}`, 400);
    }

    if (!ok) return errorResponse("writeback failed at provider", 502);
    return jsonResponse({ ok: true, source_id: src.id, action: body.action });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : String(err), 500);
  }
});
