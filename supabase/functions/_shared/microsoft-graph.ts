// Microsoft Graph helper for SharePoint / OneDrive ingest.
//
// Mirrors _shared/google-calendar.ts: refresh access token via stored
// refresh token, expose helpers for delta sync + file download + writeback.

import { getMicrosoftCredsForOrg } from "./integration-registry.ts";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

function tokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

export async function refreshMicrosoftAccessToken(
  refreshToken: string,
  orgId: string,
): Promise<{ access_token: string; refresh_token?: string; expires_at: Date } | null> {
  try {
    const { clientId, clientSecret, tenantId } = await getMicrosoftCredsForOrg(orgId);

    const res = await fetch(tokenUrl(tenantId), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: "offline_access Files.ReadWrite.All Sites.ReadWrite.All",
      }),
    });

    if (!res.ok) {
      console.error("[graph] token refresh:", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const expiresAt = new Date(Date.now() + ((data.expires_in ?? 3600) - 60) * 1000);
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: expiresAt,
    };
  } catch (err) {
    console.error("[graph] token refresh failed:", err);
    return null;
  }
}

export type DriveItem = {
  id: string;
  name: string;
  webUrl?: string;
  eTag?: string;
  cTag?: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: { mimeType?: string };
  folder?: unknown;
  deleted?: { state: string };
  parentReference?: { driveId?: string; path?: string };
};

/**
 * List drive item delta. If `deltaLink` is provided, fetches only changes
 * since that link, otherwise starts a fresh sync from the user's root drive.
 * Paginates `@odata.nextLink` until exhaustion. Returns items + new deltaLink.
 */
export async function listDriveItemsDelta(
  accessToken: string,
  deltaLink?: string,
): Promise<{ items: DriveItem[]; deltaLink: string | null }> {
  const items: DriveItem[] = [];
  let url = deltaLink ?? `${GRAPH_API}/me/drive/root/delta`;
  let newDeltaLink: string | null = null;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`graph delta ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    for (const it of (data.value ?? []) as DriveItem[]) items.push(it);
    if (data["@odata.nextLink"]) {
      url = data["@odata.nextLink"];
    } else {
      newDeltaLink = (data["@odata.deltaLink"] as string | undefined) ?? null;
      break;
    }
  }

  return { items, deltaLink: newDeltaLink };
}

/**
 * Download raw file content for a drive item. Returns null on non-text MIME
 * types we cannot extract here (PDF/DOCX/XLSX) — caller should handle.
 */
export async function downloadDriveItemText(
  accessToken: string,
  itemId: string,
  mimeType?: string,
): Promise<string | null> {
  // Only attempt extraction for text-like MIME types in v1. Binary office
  // formats need a downstream extractor (PDF.js / mammoth / xlsx) which we
  // do not run inside the edge function.
  const isText =
    !mimeType ||
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("csv") ||
    mimeType.includes("markdown") ||
    mimeType.includes("html") ||
    mimeType.includes("xml");
  if (!isText) return null;

  const res = await fetch(`${GRAPH_API}/me/drive/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error("[graph] downloadDriveItem:", res.status);
    return null;
  }
  return await res.text();
}

export async function patchDriveItem(
  accessToken: string,
  itemId: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${GRAPH_API}/me/drive/items/${itemId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function deleteDriveItem(
  accessToken: string,
  itemId: string,
): Promise<boolean> {
  const res = await fetch(`${GRAPH_API}/me/drive/items/${itemId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok;
}
