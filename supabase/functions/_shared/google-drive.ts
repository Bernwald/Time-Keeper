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
/**
 * Walk the Drive tree starting from every folder the user either owns or
 * that has been shared with them. Necessary because files.list with
 * corpora=user only surfaces directly-shared files — files that are only
 * accessible via an inherited folder share (e.g. a colleague drops a file
 * into a folder we own or that is shared with us) never appear unless we
 * explicitly query "<parent> in parents".
 */
async function listAllFilesRecursive(accessToken: string): Promise<DriveFile[]> {
  const files = new Map<string, DriveFile>();
  const visitedFolders = new Set<string>();

  async function listChildren(q: string): Promise<DriveFile[]> {
    const out: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL(`${DRIVE_API}/files`);
      url.searchParams.set("pageSize", "1000");
      url.searchParams.set(
        "fields",
        "nextPageToken,files(id,name,mimeType,webViewLink,modifiedTime,md5Checksum,size,trashed)",
      );
      url.searchParams.set("q", q);
      url.searchParams.set("supportsAllDrives", "true");
      url.searchParams.set("includeItemsFromAllDrives", "true");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        throw new Error(`drive files.list ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const data = await res.json();
      for (const f of (data.files ?? []) as DriveFile[]) out.push(f);
      pageToken = data.nextPageToken;
    } while (pageToken);
    return out;
  }

  const queue: string[] = [];

  // Seed 1: all folders the user owns or that are shared with them. We
  // query folders and non-folders separately because combining them with
  // OR can produce an empty result in Drive's query parser.
  const ownedFolders = await listChildren(
    "trashed = false and mimeType = 'application/vnd.google-apps.folder' and 'me' in owners",
  );
  const sharedFolders = await listChildren(
    "trashed = false and mimeType = 'application/vnd.google-apps.folder' and sharedWithMe = true",
  );
  for (const f of [...ownedFolders, ...sharedFolders]) {
    if (!visitedFolders.has(f.id)) {
      visitedFolders.add(f.id);
      queue.push(f.id);
    }
  }

  // Seed 2: loose files at the roots (owned + shared-with-me files that
  // aren't inside a folder we'll descend into anyway — collected eagerly,
  // the Map dedupes by id against what the BFS finds).
  const ownedFiles = await listChildren(
    "trashed = false and mimeType != 'application/vnd.google-apps.folder' and 'me' in owners",
  );
  const sharedFiles = await listChildren(
    "trashed = false and mimeType != 'application/vnd.google-apps.folder' and sharedWithMe = true",
  );
  for (const f of [...ownedFiles, ...sharedFiles]) files.set(f.id, f);

  // BFS through folders, listing children of each. Picks up inherited-
  // access files (e.g. a collaborator's file in a folder we own).
  while (queue.length > 0) {
    const folderId = queue.shift()!;
    const children = await listChildren(
      `trashed = false and '${folderId}' in parents`,
    );
    for (const f of children) {
      if (f.mimeType === "application/vnd.google-apps.folder") {
        if (!visitedFolders.has(f.id)) {
          visitedFolders.add(f.id);
          queue.push(f.id);
        }
      } else {
        files.set(f.id, f);
      }
    }
  }

  return [...files.values()];
}

export async function listDriveChanges(
  accessToken: string,
  pageToken?: string,
): Promise<{ changes: DriveChange[]; nextPageToken: string | null }> {
  const changes: DriveChange[] = [];
  let token: string | undefined = pageToken;
  let newPageToken: string | null = null;

  if (!token) {
    // Initial sync: walk the whole tree (handles inherited folder shares),
    // then capture a fresh startPageToken so the next run only sees deltas.
    const allFiles = await listAllFilesRecursive(accessToken);
    for (const f of allFiles) {
      changes.push({ fileId: f.id, file: f });
    }
    newPageToken = await getStartPageToken(accessToken);
    return { changes, nextPageToken: newPageToken };
  }

  while (token) {
    const url = new URL(`${DRIVE_API}/changes`);
    url.searchParams.set("pageToken", token);
    url.searchParams.set("pageSize", "200");
    url.searchParams.set("fields", "nextPageToken,newStartPageToken,changes(fileId,removed,time,file(id,name,mimeType,webViewLink,modifiedTime,md5Checksum,size,trashed))");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
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
  // Same tree walk as the initial sync so reconcile sees exactly the
  // files the sync would have ingested.
  const files = await listAllFilesRecursive(accessToken);
  return files.map((f) => f.id);
}

// Uploaded Office files (docx/xlsx/pptx) are OOXML — zip archives with
// XML parts inside. We pull the archive via alt=media, unzip in-memory,
// then strip XML tags from the parts that carry user-visible text.
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function stripXml(xml: string): string {
  return xml
    .replace(/<\/w:p>|<\/w:tr>|<\/a:p>|<\/text:p>|<\/row>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractOoxmlText(
  bytes: Uint8Array,
  mimeType: string,
): Promise<string | null> {
  // Lazy-load jszip only when we actually hit an OOXML file so the cold
  // start for text/html + Google-native files stays fast.
  const { default: JSZip } = await import("https://esm.sh/jszip@3.10.1");
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (err) {
    console.warn("[gdrive] ooxml unzip failed:", err);
    return null;
  }

  const textParts: string[] = [];

  if (mimeType === DOCX_MIME) {
    const doc = zip.file("word/document.xml");
    if (doc) textParts.push(stripXml(await doc.async("string")));
  } else if (mimeType === XLSX_MIME) {
    // sharedStrings.xml holds every unique string in the workbook and
    // contains the bulk of user-visible content. sheetN.xml has cell
    // references + inline numbers.
    const shared = zip.file("xl/sharedStrings.xml");
    if (shared) textParts.push(stripXml(await shared.async("string")));
    const sheetFiles = zip.file(/^xl\/worksheets\/sheet\d+\.xml$/);
    for (const sheet of sheetFiles) {
      textParts.push(stripXml(await sheet.async("string")));
    }
  } else if (mimeType === PPTX_MIME) {
    const slideFiles = zip.file(/^ppt\/slides\/slide\d+\.xml$/);
    for (const slide of slideFiles) {
      textParts.push(stripXml(await slide.async("string")));
    }
  }

  const joined = textParts.join("\n\n").trim();
  return joined.length > 0 ? joined : null;
}

async function downloadDriveBytes(
  accessToken: string,
  fileId: string,
): Promise<Uint8Array | null> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export async function downloadDriveFileText(
  accessToken: string,
  fileId: string,
  mimeType?: string,
): Promise<string | null> {
  // Google-native docs need export, plain files use alt=media.
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
  if (mimeType === "application/vnd.google-apps.presentation") {
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    return await res.text();
  }

  // Uploaded Office docs: download bytes, unzip, strip XML.
  if (mimeType === DOCX_MIME || mimeType === XLSX_MIME || mimeType === PPTX_MIME) {
    const bytes = await downloadDriveBytes(accessToken, fileId);
    if (!bytes) return null;
    try {
      return await extractOoxmlText(bytes, mimeType);
    } catch (err) {
      console.warn("[gdrive] ooxml extract failed:", fileId, err);
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
