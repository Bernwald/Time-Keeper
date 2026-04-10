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

// ---------------------------------------------------------------------------
// Structured xlsx extraction — preserves column/row relationships as Markdown
// tables so the RAG layer can answer specific data questions.
// ---------------------------------------------------------------------------

// Decode XML entities in cell values.
function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

// Convert column letter(s) to zero-based index: A→0, B→1, Z→25, AA→26 etc.
function colLetterToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i++) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64); // A=65
  }
  return idx - 1;
}

// Parse the shared-strings table into an indexed array.
function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  // Match each <si> block and extract all <t> text inside it.
  const siBlocks = xml.match(/<si[^>]*>[\s\S]*?<\/si>/gi) ?? [];
  for (const block of siBlocks) {
    const tMatches = block.match(/<t[^>]*>([\s\S]*?)<\/t>/gi) ?? [];
    const combined = tMatches
      .map((t) => {
        const inner = t.replace(/<t[^>]*>/i, "").replace(/<\/t>/i, "");
        return decodeXmlEntities(inner);
      })
      .join("");
    strings.push(combined);
  }
  return strings;
}

// Parse sheet names from workbook.xml. Returns ordered array.
function parseSheetNames(xml: string): string[] {
  const names: string[] = [];
  const re = /<sheet\s[^>]*name="([^"]*)"[^>]*\/?>(?:<\/sheet>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    names.push(decodeXmlEntities(m[1]));
  }
  return names;
}

// Parse a single sheet XML into a 2D string grid.
function parseSheetGrid(
  xml: string,
  sharedStrings: string[],
): string[][] {
  const rows: Array<{ rowIdx: number; cells: Array<{ col: number; value: string }> }> = [];

  // Match each <row> block.
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const rowContent = rowMatch[1];
    const cells: Array<{ col: number; value: string }> = [];

    // Match each <c> cell.
    const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowContent)) !== null) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";

      // Cell reference (e.g. "B3") → extract column letters.
      const refMatch = attrs.match(/r="([A-Z]+)\d+"/i);
      if (!refMatch) continue;
      const colIdx = colLetterToIndex(refMatch[1].toUpperCase());

      // Cell type: t="s" = shared string, t="inlineStr" = inline, else number/raw.
      const typeMatch = attrs.match(/t="([^"]*)"/i);
      const cellType = typeMatch?.[1] ?? "";

      let value = "";
      if (cellType === "s") {
        // Shared string reference — <v> contains the index.
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/i);
        const idx = vMatch ? parseInt(vMatch[1], 10) : -1;
        value = idx >= 0 && idx < sharedStrings.length ? sharedStrings[idx] : "";
      } else if (cellType === "inlineStr") {
        // Inline string — text lives inside <is><t>...</t></is>.
        const tMatch = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/i);
        value = tMatch ? decodeXmlEntities(tMatch[1]) : "";
      } else {
        // Number, boolean, or other — take raw <v> content.
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/i);
        value = vMatch ? decodeXmlEntities(vMatch[1]) : "";
      }

      cells.push({ col: colIdx, value: value.trim() });
    }

    if (cells.length > 0) {
      // Determine row index from the first cell reference.
      const rowNumMatch = rowMatch[0].match(/<row\b[^>]*r="(\d+)"/i);
      const rowIdx = rowNumMatch ? parseInt(rowNumMatch[1], 10) - 1 : rows.length;
      rows.push({ rowIdx, cells });
    }
  }

  if (rows.length === 0) return [];

  // Determine grid dimensions.
  let maxCol = 0;
  for (const row of rows) {
    for (const cell of row.cells) {
      if (cell.col > maxCol) maxCol = cell.col;
    }
  }

  // Build the 2D grid.
  const grid: string[][] = [];
  for (const row of rows) {
    const rowArr = new Array<string>(maxCol + 1).fill("");
    for (const cell of row.cells) {
      rowArr[cell.col] = cell.value;
    }
    grid.push(rowArr);
  }

  // Trim trailing empty columns — Excel files often have sparse columns
  // far to the right that bloat the output (e.g. 9 real cols + 60 empty).
  if (grid.length > 0) {
    let lastUsedCol = 0;
    for (const row of grid) {
      for (let c = row.length - 1; c >= 0; c--) {
        if (row[c].trim()) {
          if (c > lastUsedCol) lastUsedCol = c;
          break;
        }
      }
    }
    // Keep up to lastUsedCol (inclusive).
    for (let r = 0; r < grid.length; r++) {
      grid[r] = grid[r].slice(0, lastUsedCol + 1);
    }
  }

  return grid;
}

// Escape pipe characters inside cell values for Markdown tables.
function escPipe(s: string): string {
  return s.replace(/\|/g, "\\|");
}

// Format a 2D grid as a Markdown table. For very wide tables (single row
// exceeds ~300 tokens ≈ 1200 chars), switch to a vertical key-value format.
function gridToMarkdown(grid: string[][], sheetName: string): string {
  if (grid.length === 0) return "";

  const headers = grid[0];
  const dataRows = grid.slice(1);

  // Estimate width of one row in characters.
  const sampleRow = headers.join(" | ");
  const isWide = sampleRow.length > 1200;

  const lines: string[] = [`## Sheet: ${sheetName}`];

  if (isWide) {
    // Vertical format for wide tables: one "record" block per row.
    for (let r = 0; r < dataRows.length; r++) {
      lines.push("");
      lines.push(`### Zeile ${r + 2}`);
      for (let c = 0; c < headers.length; c++) {
        const val = dataRows[r]?.[c] ?? "";
        if (val) lines.push(`${headers[c]}: ${val}`);
      }
    }
  } else {
    // Standard Markdown table.
    lines.push("| " + headers.map(escPipe).join(" | ") + " |");
    lines.push("| " + headers.map(() => "---").join(" | ") + " |");
    for (const row of dataRows) {
      // Skip completely empty rows.
      if (row.every((c) => !c)) continue;
      lines.push("| " + row.map(escPipe).join(" | ") + " |");
    }
  }

  return lines.join("\n");
}

// Main xlsx structured extractor. Accepts an already-opened JSZip instance.
async function extractXlsxStructured(
  zip: { file: (path: string | RegExp) => any },
): Promise<string | null> {
  // 1. Parse shared strings.
  const sharedFile = zip.file("xl/sharedStrings.xml");
  const sharedStrings = sharedFile
    ? parseSharedStrings(await sharedFile.async("string"))
    : [];

  // 2. Parse sheet names from workbook.xml.
  const wbFile = zip.file("xl/workbook.xml");
  const sheetNames = wbFile
    ? parseSheetNames(await wbFile.async("string"))
    : [];

  // 3. Parse each sheet and format as Markdown.
  const sheetFiles = zip.file(/^xl\/worksheets\/sheet\d+\.xml$/) as Array<{
    name: string;
    async: (type: string) => Promise<string>;
  }>;

  // Sort sheet files by number to match workbook order.
  sheetFiles.sort((a, b) => {
    const numA = parseInt(a.name.match(/sheet(\d+)/)?.[1] ?? "0", 10);
    const numB = parseInt(b.name.match(/sheet(\d+)/)?.[1] ?? "0", 10);
    return numA - numB;
  });

  const sections: string[] = [];
  for (let i = 0; i < sheetFiles.length; i++) {
    const sheetXml = await sheetFiles[i].async("string");
    const grid = parseSheetGrid(sheetXml, sharedStrings);
    if (grid.length === 0) continue;

    const name = sheetNames[i] ?? `Sheet${i + 1}`;
    sections.push(gridToMarkdown(grid, name));
  }

  const result = sections.join("\n\n").trim();
  return result.length > 0 ? result : null;
}

export async function extractOoxmlText(
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
    const structured = await extractXlsxStructured(zip);
    if (structured) textParts.push(structured);
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
