"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrgId } from "@/lib/db/org-context";
import { createServiceClient } from "@/lib/db/supabase-server";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

export async function connectSharepoint(): Promise<void> {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const tenantId = process.env.MICROSOFT_TENANT_ID || "common";
  if (!clientId) throw new Error("MICROSOFT_CLIENT_ID not set");
  const redirectUri = `${APP_URL}/auth/callback/sharepoint`;
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
  const redirectUri = `${APP_URL}/auth/callback/gdrive`;
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
export async function triggerInitialSync(
  providerId: "sharepoint" | "google_drive",
): Promise<void> {
  const orgId = await requireOrgId();
  const url =
    providerId === "sharepoint"
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/connector-sharepoint`
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/connector-gdrive`;

  await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ action: "initial-sync", organization_id: orgId }),
  });

  revalidatePath("/quellen");
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
        last_synced_at: null,
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
        last_synced_at: null,
      },
      { onConflict: "organization_id,provider_id" },
    );
  if (error) {
    console.error("[saveGdriveTokens] upsert failed:", error);
    throw error;
  }
  revalidatePath("/quellen");
}
