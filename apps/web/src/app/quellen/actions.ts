"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgId } from "@/lib/db/org-context";
import { createServiceClient } from "@/lib/db/supabase-server";
import { getAppUrl } from "@/lib/app-url";

export async function connectSharepoint(): Promise<void> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
  if (!clientId) throw new Error("MICROSOFT_CLIENT_ID not set");
  const redirectUri = `${getAppUrl()}/auth/callback/sharepoint`;
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "offline_access Files.ReadWrite.All Sites.ReadWrite.All",
  });
  redirect(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`,
  );
}

export async function connectGdrive(): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID not set");
  const redirectUri = `${getAppUrl()}/auth/callback/gdrive`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/drive.readonly",
    access_type: "offline",
    prompt: "consent",
  });
  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

// Trigger an initial-sync for the given provider via the edge function.
// Surfaces HTTP + function errors back to /quellen via a search param so
// the user sees why nothing happened after clicking "Jetzt synchronisieren".
export async function triggerInitialSync(
  providerId: "sharepoint" | "google_drive",
): Promise<void> {
  const orgId = await requireOrgId();
  const url =
    providerId === "sharepoint"
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/connector-sharepoint`
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/connector-gdrive`;

  let errorMessage: string | null = null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ action: "initial-sync", organization_id: orgId }),
    });
    if (!res.ok) {
      const body = await res.text();
      errorMessage = `Sync fehlgeschlagen (${res.status}): ${body.slice(0, 200)}`;
      console.error("[triggerInitialSync]", providerId, res.status, body);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[triggerInitialSync] fetch failed:", providerId, err);
  }

  revalidatePath("/quellen");
  revalidatePath("/papierkorb");

  if (errorMessage) {
    redirect(`/quellen?error=${encodeURIComponent(errorMessage)}`);
  } else {
    redirect(`/quellen?connected=${encodeURIComponent(providerId === "sharepoint" ? "SharePoint synchronisiert" : "Google Drive synchronisiert")}`);
  }
}

// Re-enqueue the latest raw_events row for a single connector source so the
// normalize → embed pipeline runs again. Use this when a file is stuck (e.g.
// failed embed) and the user wants to retry without triggering a full sync.
export async function retrySource(sourceId: string): Promise<void> {
  const orgId = await requireOrgId();
  const db = createServiceClient();

  const { data: source, error: srcErr } = await db
    .from("sources")
    .select("id, organization_id, connector_type, external_id")
    .eq("id", sourceId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (srcErr) throw srcErr;
  if (!source || !source.external_id) throw new Error("source not found");

  const providerId =
    source.connector_type === "sharepoint" ? "sharepoint" : "google_drive";

  const { data: raw, error: rawErr } = await db
    .from("raw_events")
    .select("run_id, entity_type, payload_hash")
    .eq("organization_id", orgId)
    .eq("provider_id", providerId)
    .eq("external_id", source.external_id)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rawErr) throw rawErr;
  if (!raw) throw new Error("no raw_events row found for this source");

  // Mark as queued so the UI shows progress immediately.
  await db
    .from("sources")
    .update({ sync_status: "queued" })
    .eq("id", sourceId);

  const { error: enqErr } = await db.rpc("pgmq_send", {
    p_queue: "normalize",
    p_msg: {
      organization_id: orgId,
      provider_id: providerId,
      run_id: raw.run_id,
      external_id: source.external_id,
      entity_type: raw.entity_type,
      payload_hash: raw.payload_hash,
    },
  });
  if (enqErr) throw enqErr;

  revalidatePath("/quellen");
  revalidatePath("/sources");
}

// Manual reconcile: drop every connector source whose Drive counterpart is
// gone. Surfaces the count back to the page via search params.
export async function reconcileConnector(
  providerId: "google_drive" | "sharepoint",
): Promise<void> {
  const orgId = await requireOrgId();
  const url =
    providerId === "sharepoint"
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/connector-sharepoint`
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/connector-gdrive`;

  const call = async (action: "initial-sync" | "reconcile"): Promise<string | null> => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ action, organization_id: orgId }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error("[reconcileConnector]", action, res.status, body);
        return `${action} fehlgeschlagen (${res.status}): ${body.slice(0, 200)}`;
      }
      return null;
    } catch (err) {
      console.error("[reconcileConnector] fetch failed:", action, err);
      return err instanceof Error ? err.message : String(err);
    }
  };

  // First do a full re-listing so newly added or restored Drive files land
  // as raw_events, then reconcile away anything that's gone. Sequential — the
  // reconcile pass should see the freshly upserted sources.
  const syncErr = await call("initial-sync");
  const reconcileErr = syncErr ? null : await call("reconcile");
  const errorMessage = syncErr ?? reconcileErr;

  revalidatePath("/quellen");
  revalidatePath("/papierkorb");

  if (errorMessage) {
    redirect(`/quellen?error=${encodeURIComponent(errorMessage)}`);
  } else {
    redirect(`/quellen?connected=${encodeURIComponent("Aufräumen abgeschlossen")}`);
  }
}

// Soft-delete a single source — moves it into the trash.
export async function deleteSource(sourceId: string): Promise<void> {
  await requireOrgId();
  const db = createServiceClient();
  const { error } = await db.rpc("soft_delete_source", { p_source_id: sourceId });
  if (error) throw error;
  revalidatePath("/quellen");
  revalidatePath("/sources");
  revalidatePath("/papierkorb");
}

// Restore a soft-deleted source — clears deleted_at and requeues it.
export async function restoreSource(sourceId: string): Promise<void> {
  await requireOrgId();
  const db = createServiceClient();
  const { error } = await db.rpc("restore_source", { p_source_id: sourceId });
  if (error) throw error;
  revalidatePath("/quellen");
  revalidatePath("/sources");
  revalidatePath("/papierkorb");
}

// Hard-delete a soft-deleted source. Point of no return.
export async function purgeSource(sourceId: string): Promise<void> {
  await requireOrgId();
  const db = createServiceClient();
  const { error } = await db.rpc("purge_source", { p_source_id: sourceId });
  if (error) throw error;
  revalidatePath("/papierkorb");
}

// Persist OAuth tokens after successful callback.
export async function saveSharepointTokens(tokens: {
  refresh_token: string;
  access_token: string;
  expires_in: number;
}): Promise<void> {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

  // Preserve last_synced_at on reconnect. An OAuth refresh shouldn't wipe
  // the sync history — that's what made /quellen render "noch nie
  // synchronisiert" for integrations that were clearly syncing before.
  const { error } = await db
    .from("organization_integrations")
    .upsert(
      {
        organization_id: orgId,
        provider_id: "sharepoint",
        status: "active",
        credential_mode: "platform",
        credentials: {
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          token_expires_at: expiresAt,
        },
      },
      { onConflict: "organization_id,provider_id" },
    );
  if (error) {
    console.error("[saveSharepointTokens] upsert failed:", error);
    throw error;
  }
  revalidatePath("/quellen");
}

export async function saveGdriveTokens(tokens: {
  refresh_token: string;
  access_token: string;
  expires_in: number;
}): Promise<void> {
  const orgId = await requireOrgId();
  const db = createServiceClient();
  const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString();

  const { error } = await db
    .from("organization_integrations")
    .upsert(
      {
        organization_id: orgId,
        provider_id: "google_drive",
        status: "active",
        credential_mode: "platform",
        credentials: {
          refresh_token: tokens.refresh_token,
          access_token: tokens.access_token,
          token_expires_at: expiresAt,
        },
      },
      { onConflict: "organization_id,provider_id" },
    );
  if (error) {
    console.error("[saveGdriveTokens] upsert failed:", error);
    throw error;
  }
  revalidatePath("/quellen");
}
