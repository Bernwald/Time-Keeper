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

// Parse a single sheet XML into a 2D string grid. Also counts cells that
// carry a formula (<f>) but no cached value (<v>) — these show up when a
// workbook is saved without recalculation (e.g. Google Sheets export, or
// LibreOffice with manual calc), which would otherwise turn into silent
// empty cells in the extracted text.
function parseSheetGrid(
  xml: string,
  sharedStrings: string[],
): { grid: string[][]; uncachedFormulas: number } {
  const rows: Array<{ rowIdx: number; cells: Array<{ col: number; value: string }> }> = [];
  let uncachedFormulas = 0;

  // Match each <row> block.
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const rowContent = rowMatch[1];
    const cells: Array<{ col: number; value: string }> = [];

    // Match each <c> cell.
    //
    // NOTE: the attribute group MUST be lazy (`[^>]*?`). A greedy `[^>]*`
    // would swallow the `/` in self-closing `<c r="R48" s="27"/>` tags,
    // so the `\/>` alternative never fires — instead the engine backtracks
    // and matches `>...<\/c>` against the NEXT cell, shifting every
    // following column by one. Google Sheets exports emit self-closing
    // tags for empty cells, which is how this bug surfaces in practice.
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi;
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
        // Number, boolean, or formula result — take raw <v> content.
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/i);
        if (vMatch) {
          value = decodeXmlEntities(vMatch[1]);
        } else if (/<f[\s>]/i.test(inner)) {
          // Formula present but no cached value — workbook was saved
          // without recalculation. Emit an explicit placeholder so the
          // LLM can flag the gap instead of treating the cell as empty.
          value = "«Formel nicht berechnet»";
          uncachedFormulas++;
        } else {
          value = "";
        }
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

  if (rows.length === 0) return { grid: [], uncachedFormulas };

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

  return { grid, uncachedFormulas };
}

// ---------------------------------------------------------------------------
// Structured sheet rendering.
//
// Sheets in the wild don't follow a single layout: headers can be on top
// (row-major) or on the left (column-major, transposed); a single sheet can
// contain multiple sub-tables separated by empty rows. The previous renderer
// assumed row-major + single table and packed rows into a Markdown grid,
// which made individual records hard to find via keyword search (the entity
// name appeared once while header tokens dominated every chunk).
//
// New pipeline:
//   1. segmentSheet(grid)       split sheet at ≥2 empty rows into sub-tables
//   2. detectOrientation(seg)   header-top vs header-left heuristic
//   3. segmentToRecords(seg,o)  extract per-record field lists
//   4. segmentsToStructured()   emit "### Zeile N — <title>" blocks so FTS
//                               and embedding pipelines see every record as
//                               a self-contained unit, yet multiple records
//                               are packed into a single chunk downstream.
// ---------------------------------------------------------------------------

interface TableSegment {
  /** Data rows of this sub-table (sparse, may contain empty cells). */
  rows: string[][];
  /** 1-based row number of the first row in the original sheet (provenance). */
  originRow: number;
}

interface ExtractedRecord {
  /** Short title shown in the block header — helps FTS and humans locate rows. */
  title: string;
  /** 1-based row number in the original sheet. */
  originRow: number;
  /** Ordered key/value fields (empty values dropped). */
  fields: Array<{ header: string; value: string }>;
}

function isRowEmpty(row: string[]): boolean {
  return row.every((c) => !c || !c.trim());
}

function looksNumeric(s: string): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!t) return false;
  // Accept "1.234,56", "1234.56", "42", "2023", "42 €", "-3,5%".
  return /^-?\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d+)?\s*[%€$]?$/.test(t) || /^-?\d+([.,]\d+)?$/.test(t);
}

/** Split a sheet grid into sub-tables at runs of ≥2 consecutive empty rows. */
function segmentSheet(grid: string[][]): TableSegment[] {
  const segments: TableSegment[] = [];
  let buffer: string[][] = [];
  let bufferOrigin = 1; // 1-based
  let emptyRun = 0;

  const flush = () => {
    // Drop trailing empty rows inside the buffer before emitting.
    while (buffer.length > 0 && isRowEmpty(buffer[buffer.length - 1])) {
      buffer.pop();
    }
    if (buffer.length >= 2) {
      segments.push({ rows: buffer, originRow: bufferOrigin });
    }
    buffer = [];
  };

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    if (isRowEmpty(row)) {
      emptyRun++;
      if (emptyRun >= 2 && buffer.length > 0) {
        flush();
      }
      continue;
    }
    if (buffer.length === 0) {
      bufferOrigin = r + 1; // 1-based
    }
    emptyRun = 0;
    buffer.push(row);
  }
  flush();

  // If no segments survived (e.g. entire sheet was one block with no gaps),
  // fall back to the whole grid minus trailing empties.
  if (segments.length === 0 && grid.length > 0) {
    const trimmed: string[][] = [];
    for (const row of grid) {
      if (trimmed.length > 0 || !isRowEmpty(row)) trimmed.push(row);
    }
    while (trimmed.length > 0 && isRowEmpty(trimmed[trimmed.length - 1])) {
      trimmed.pop();
    }
    if (trimmed.length > 0) {
      segments.push({ rows: trimmed, originRow: 1 });
    }
  }

  return segments;
}

/**
 * Decide if a segment is row-major (header in row 0) or column-major
 * (header in column 0, rotated/transposed layout).
 *
 * Heuristic: count numeric cells in row 0 vs column 0 (each excluding cell
 * (0,0) which can be either a corner or a label). If row 0 is mostly numeric
 * it's more likely data than a header → column-major. Otherwise row-major.
 */
function detectOrientation(segment: TableSegment): "row-major" | "column-major" {
  if (segment.rows.length < 2) return "row-major";
  const firstRow = segment.rows[0];
  const rowLen   = firstRow.length;
  if (rowLen < 2) return "row-major";

  let rowNumeric = 0;
  let rowFilled  = 0;
  for (let c = 1; c < rowLen; c++) {
    const v = firstRow[c] ?? "";
    if (v.trim()) {
      rowFilled++;
      if (looksNumeric(v)) rowNumeric++;
    }
  }

  let colNumeric = 0;
  let colFilled  = 0;
  for (let r = 1; r < segment.rows.length; r++) {
    const v = segment.rows[r]?.[0] ?? "";
    if (v.trim()) {
      colFilled++;
      if (looksNumeric(v)) colNumeric++;
    }
  }

  const rowNumericRatio = rowFilled > 0 ? rowNumeric / rowFilled : 0;
  const colNumericRatio = colFilled > 0 ? colNumeric / colFilled : 0;

  // First row is mostly numbers while first col is mostly labels → transposed.
  if (rowNumericRatio >= 0.6 && colNumericRatio <= 0.3 && colFilled >= 2) {
    return "column-major";
  }
  return "row-major";
}

/** Shorten a value for use in a block title (max ~60 chars). */
function shortValue(s: string): string {
  const t = (s ?? "").trim();
  if (t.length <= 60) return t;
  return t.slice(0, 57) + "…";
}

/**
 * Extract per-record data from a segment. Returns the header list + one
 * ExtractedRecord per data entry (row for row-major, column for column-major).
 */
function segmentToRecords(
  segment: TableSegment,
  orientation: "row-major" | "column-major",
): { headers: string[]; records: ExtractedRecord[] } {
  if (orientation === "row-major") {
    const headers = (segment.rows[0] ?? []).map((h) => (h ?? "").trim());
    const records: ExtractedRecord[] = [];
    for (let r = 1; r < segment.rows.length; r++) {
      const row = segment.rows[r];
      if (!row || isRowEmpty(row)) continue;
      const fields: Array<{ header: string; value: string }> = [];
      for (let c = 0; c < headers.length; c++) {
        const value = (row[c] ?? "").trim();
        if (!value) continue;
        const header = headers[c] || `Spalte ${c + 1}`;
        fields.push({ header, value });
      }
      if (fields.length === 0) continue;
      // Title: first 1–2 field values (usually entity + year/label).
      const head = shortValue(fields[0].value);
      const tail = fields[1] && fields[1].value && fields[1].value !== head
        ? ` ${shortValue(fields[1].value)}`
        : "";
      records.push({
        title:     (head + tail).trim() || `Zeile ${segment.originRow + r}`,
        originRow: segment.originRow + r,
        fields,
      });
    }
    return { headers, records };
  }

  // column-major: first column = headers, each subsequent column = one record.
  const headers: string[] = [];
  for (let r = 1; r < segment.rows.length; r++) {
    headers.push(((segment.rows[r] ?? [])[0] ?? "").trim());
  }
  const records: ExtractedRecord[] = [];
  const firstRow = segment.rows[0] ?? [];
  const colCount = firstRow.length;
  for (let c = 1; c < colCount; c++) {
    const colLabel = (firstRow[c] ?? "").trim();
    const fields: Array<{ header: string; value: string }> = [];
    for (let r = 1; r < segment.rows.length; r++) {
      const value = ((segment.rows[r] ?? [])[c] ?? "").trim();
      if (!value) continue;
      const header = headers[r - 1] || `Zeile ${r + 1}`;
      fields.push({ header, value });
    }
    if (fields.length === 0) continue;
    const head = colLabel || shortValue(fields[0]?.value ?? "");
    records.push({
      title:     head || `Spalte ${c + 1}`,
      originRow: segment.originRow,
      fields,
    });
  }
  return { headers, records };
}

/**
 * Render a sheet as one or more structured segments. Each record becomes a
 * "### Zeile N — <title>" block with explicit "Header: Wert" lines so the
 * downstream vertical chunker (chunking.ts:chunkVerticalText) packs complete
 * records into chunks and FTS finds unique entity names easily.
 */
function segmentsToStructured(sheetName: string, segments: TableSegment[]): string {
  const lines: string[] = [`## Sheet: ${sheetName}`];

  for (let s = 0; s < segments.length; s++) {
    const segment = segments[s];
    const orientation = detectOrientation(segment);
    const { headers, records } = segmentToRecords(segment, orientation);
    if (records.length === 0) continue;

    if (segments.length > 1) {
      lines.push("");
      lines.push(
        `### Tabelle ${s + 1} (ab Zeile ${segment.originRow}, ${orientation === "column-major" ? "transponiert" : "Zeilen-Layout"})`,
      );
    } else if (orientation === "column-major") {
      lines.push(`_Layout: transponiert (Spaltenkopf links)_`);
    }

    // Compact column overview helps the LLM understand the schema before it
    // sees the records.
    const uniqueHeaders = headers.filter((h) => h && h.trim());
    if (uniqueHeaders.length > 0) {
      lines.push(`Spalten: ${uniqueHeaders.join(", ")}`);
    }

    for (const record of records) {
      lines.push("");
      lines.push(`### Zeile ${record.originRow} — ${record.title}`);
      // Pipe-separated single line keeps records compact (more per chunk)
      // while still pairing each value with its header token for FTS.
      // We tried one-field-per-line for cleaner LLM extraction, but it
      // shifted FTS rank density (the cover-density score drops when
      // matched terms spread across many lines), pushing the right chunk
      // out of the top-30 FTS pool — so questions like
      // "Wie viele kostenlose Lizenzen hatte Biofach Vivaness 2025?"
      // started returning "keine Informationen" even though the data
      // was in a chunk. Pipe format keeps both retrieval AND extraction
      // working.
      lines.push(
        record.fields
          .map((f) => `${f.header}: ${f.value}`)
          .join(" | "),
      );
    }
  }

  return lines.join("\n");
}

/**
 * Text extracted from a file plus optional diagnostics. `formulaWarnings`
 * is populated only for xlsx files and maps sheet name → count of cells
 * that carry a formula without a cached value.
 */
export type ExtractedContent = {
  text: string;
  formulaWarnings?: Record<string, number>;
};

// Main xlsx structured extractor. Accepts an already-opened JSZip instance.
async function extractXlsxStructured(
  zip: { file: (path: string | RegExp) => any },
): Promise<{ text: string; sheetWarnings: Record<string, number> } | null> {
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
  const sheetWarnings: Record<string, number> = {};
  for (let i = 0; i < sheetFiles.length; i++) {
    const sheetXml = await sheetFiles[i].async("string");
    const { grid, uncachedFormulas } = parseSheetGrid(sheetXml, sharedStrings);
    const name = sheetNames[i] ?? `Sheet${i + 1}`;
    if (uncachedFormulas > 0) {
      sheetWarnings[name] = uncachedFormulas;
      console.warn(
        `[xlsx] Sheet "${name}": ${uncachedFormulas} Formel-Zellen ohne cached value — Datei bitte in Excel öffnen & neu speichern.`,
      );
    }
    if (grid.length === 0) continue;

    const segments = segmentSheet(grid);
    if (segments.length === 0) continue;
    const rendered = segmentsToStructured(name, segments);
    if (rendered.trim()) sections.push(rendered);
  }

  const result = sections.join("\n\n").trim();
  if (result.length === 0 && Object.keys(sheetWarnings).length === 0) return null;
  return { text: result, sheetWarnings };
}

export async function extractOoxmlText(
  bytes: Uint8Array,
  mimeType: string,
): Promise<ExtractedContent | null> {
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
  let formulaWarnings: Record<string, number> | undefined;

  if (mimeType === DOCX_MIME) {
    const doc = zip.file("word/document.xml");
    if (doc) textParts.push(stripXml(await doc.async("string")));
  } else if (mimeType === XLSX_MIME) {
    const structured = await extractXlsxStructured(zip);
    if (structured) {
      if (structured.text) textParts.push(structured.text);
      if (Object.keys(structured.sheetWarnings).length > 0) {
        formulaWarnings = structured.sheetWarnings;
      }
    }
  } else if (mimeType === PPTX_MIME) {
    const slideFiles = zip.file(/^ppt\/slides\/slide\d+\.xml$/);
    for (const slide of slideFiles) {
      textParts.push(stripXml(await slide.async("string")));
    }
  }

  const joined = textParts.join("\n\n").trim();
  if (joined.length === 0 && !formulaWarnings) return null;
  return { text: joined, formulaWarnings };
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
): Promise<ExtractedContent | null> {
  // Google-native docs need export, plain files use alt=media.
  if (mimeType === "application/vnd.google-apps.document") {
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    return { text: await res.text() };
  }
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=text/csv`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    return { text: await res.text() };
  }
  if (mimeType === "application/vnd.google-apps.presentation") {
    const res = await fetch(
      `${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) return null;
    return { text: await res.text() };
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
  return { text: await res.text() };
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
