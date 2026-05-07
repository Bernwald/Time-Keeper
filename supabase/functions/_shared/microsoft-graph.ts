// Microsoft Graph helper for SharePoint / OneDrive ingest.
//
// Mirrors _shared/google-calendar.ts: refresh access token via stored
// refresh token, expose helpers for delta sync + file download + writeback.

import { getMicrosoftCredsForOrg } from "./integration-registry.ts";
import { extractOoxmlText, type ExtractedContent } from "./google-drive.ts";

const GRAPH_API = "https://graph.microsoft.com/v1.0";

const OOXML_MIMES = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function tokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
}

// Throws a structured Error if Microsoft rejects the refresh. The message
// includes the AADSTS code + description from Microsoft so callers (and the
// UI on /quellen) can distinguish `invalid_client` (rotated/expired client
// secret) from `invalid_grant` (refresh_token expired) at a glance.
export async function refreshMicrosoftAccessToken(
  refreshToken: string,
  orgId: string,
): Promise<{ access_token: string; refresh_token?: string; expires_at: Date }> {
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
    const body = await res.text();
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body) as { error?: string; error_description?: string };
      if (parsed.error || parsed.error_description) {
        detail = [parsed.error, parsed.error_description].filter(Boolean).join(": ").slice(0, 400);
      }
    } catch { /* keep raw text */ }
    console.error("[graph] token refresh:", res.status, body);
    throw new Error(`microsoft token refresh failed (${res.status}): ${detail}`);
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + ((data.expires_in ?? 3600) - 60) * 1000);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: expiresAt,
  };
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
 * Download file content for a drive item. Handles text-like files directly
 * and Office OOXML files (docx/xlsx/pptx) via shared extractOoxmlText helper.
 */
export async function downloadDriveItemText(
  accessToken: string,
  itemId: string,
  mimeType?: string,
): Promise<ExtractedContent | null> {
  // OOXML office files — download bytes and extract via shared helper.
  if (mimeType && OOXML_MIMES.has(mimeType)) {
    const res = await fetch(`${GRAPH_API}/me/drive/items/${itemId}/content`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.error("[graph] downloadDriveItem:", res.status);
      return null;
    }
    try {
      const bytes = new Uint8Array(await res.arrayBuffer());
      return await extractOoxmlText(bytes, mimeType);
    } catch (err) {
      console.warn("[graph] ooxml extract failed:", itemId, err);
      return null;
    }
  }

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
  return { text: await res.text() };
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
