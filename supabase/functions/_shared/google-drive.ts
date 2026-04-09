// Google Drive helper for ingest. Uses the same OAuth refresh helper as
// Calendar but against Drive API endpoints + scopes.

import { refreshAccessToken } from "./google-calendar.ts";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

export { refreshAccessToken as refreshGoogleAccessToken };

export type DriveFile = {
  id: string;
  name: string;
  mimeType?: string;
  webViewLink?: string;
  modifiedTime?: string;
  md5Checksum?: string;
  size?: string;
  trashed?: boolean;
};

export type DriveChange = {
  fileId?: string;
  removed?: boolean;
  file?: DriveFile;
  time?: string;
};

/**
 * Fetch a fresh start-page-token used to bootstrap the changes feed.
 */
export async function getStartPageToken(accessToken: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/changes/startPageToken`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`drive startPageToken ${res.status}`);
  const data = await res.json();
  return data.startPageToken as string;
}

/**
 * List file changes since `pageToken`. If no pageToken given, do a full
 * listing of the user's files (initial sync).
 */
export async function listDriveChanges(
  accessToken: string,
  pageToken?: string,
): Promise<{ changes: DriveChange[]; nextPageToken: string | null }> {
  const changes: DriveChange[] = [];
  let token: string | undefined = pageToken;
  let newPageToken: string | null = null;

  if (!token) {
    // Initial sync: enumerate files via files.list, then capture a fresh
    // startPageToken so the next run only sees deltas.
    let nextFileToken: string | undefined;
    do {
      const url = new URL(`${DRIVE_API}/files`);
      url.searchParams.set("pageSize", "200");
      url.searchParams.set("fields", "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,md5Checksum,size,trashed)");
      url.searchParams.set("q", "trashed = false and mimeType != 'application/vnd.google-apps.folder'");
      if (nextFileToken) url.searchParams.set("pageToken", nextFileToken);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) throw new Error(`drive files.list ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      for (const f of (data.files ?? []) as DriveFile[]) {
        changes.push({ fileId: f.id, file: f });
      }
      nextFileToken = data.nextPageToken;
    } while (nextFileToken);

    newPageToken = await getStartPageToken(accessToken);
    return { changes, nextPageToken: newPageToken };
  }

  while (token) {
    const url = new URL(`${DRIVE_API}/changes`);
    url.searchParams.set("pageToken", token);
    url.searchParams.set("pageSize", "200");
    url.searchParams.set("fields", "nextPageToken,newStartPageToken,changes(fileId,removed,time,file(id,name,mimeType,webViewLink,modifiedTime,md5Checksum,size,trashed))");
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`drive changes ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    for (const c of (data.changes ?? []) as DriveChange[]) {
      // Drive Changes API has no q-filter, so folders sneak back in here.
      // Drop them in code to match the files.list folder filter.
      if (c.file?.mimeType === "application/vnd.google-apps.folder") continue;
      changes.push(c);
    }
    if (data.nextPageToken) {
      token = data.nextPageToken;
    } else {
      newPageToken = (data.newStartPageToken as string | undefined) ?? null;
      break;
    }
  }

  return { changes, nextPageToken: newPageToken };
}

/**
 * Page through `files.list` and collect every visible file id. Used by the
 * reconciliation pass to soft-delete sources whose Drive counterpart has
 * disappeared (deleted, trashed, access revoked, moved out of scope).
 */
export async function listAllDriveFileIds(
  accessToken: string,
): Promise<string[]> {
  const ids: string[] = [];
  let nextPageToken: string | undefined;
  do {
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("fields", "nextPageToken,files(id)");
    url.searchParams.set("q", "trashed = false and mimeType != 'application/vnd.google-apps.folder'");
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`drive files.list ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    for (const f of (data.files ?? []) as { id: string }[]) ids.push(f.id);
    nextPageToken = data.nextPageToken;
  } while (nextPageToken);
  return ids;
}

export async function downloadDriveFileText(
  accessToken: string,
  fileId: string,
  mimeType?: string,
): Promise<string | null> {
  // Google-native docs need export, plain files use alt=media. Limit to
  // text-extractable types in v1.
  if (mimeType === "application/vnd.google-apps.document") {
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    return await res.text();
  }
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=text/csv`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    return await res.text();
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

  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return await res.text();
}

export async function patchDriveFile(
  accessToken: string,
  fileId: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function deleteDriveFile(
  accessToken: string,
  fileId: string,
): Promise<boolean> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return res.ok;
}
