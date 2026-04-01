export type ParsedData = {
  headers: string[];
  rows: Record<string, string>[];
};

// Parse CSV string with proper quote handling
export function parseCsv(text: string, delimiter = ","): ParsedData {
  const lines: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        current.push(field.trim());
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        current.push(field.trim());
        if (current.some((f) => f !== "")) lines.push(current);
        current = [];
        field = "";
        if (ch === "\r") i++;
      } else {
        field += ch;
      }
    }
  }

  // Last field/line
  current.push(field.trim());
  if (current.some((f) => f !== "")) lines.push(current);

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0];
  const rows = lines.slice(1).map((line) => {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = line[i] ?? "";
    });
    return row;
  });

  return { headers, rows };
}

// Auto-detect delimiter from first line
export function detectDelimiter(text: string): string {
  const firstLine = text.split("\n")[0] ?? "";
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0, "|": 0 };
  for (const ch of firstLine) {
    if (ch in counts) counts[ch]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ",";
}

// Parse Excel buffer to ParsedData
export async function parseExcel(buffer: ArrayBuffer): Promise<ParsedData> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };

  const sheet = workbook.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  if (json.length === 0) return { headers: [], rows: [] };

  const headers = Object.keys(json[0]);
  const rows = json.map((row) => {
    const mapped: Record<string, string> = {};
    headers.forEach((h) => {
      mapped[h] = String(row[h] ?? "");
    });
    return mapped;
  });

  return { headers, rows };
}

// Parse JSON array
export function parseJsonArray(text: string): ParsedData {
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed) || parsed.length === 0) return { headers: [], rows: [] };

  const headers = Object.keys(parsed[0]);
  const rows = parsed.map((item: Record<string, unknown>) => {
    const mapped: Record<string, string> = {};
    headers.forEach((h) => {
      const val = item[h];
      mapped[h] = typeof val === "object" ? JSON.stringify(val) : String(val ?? "");
    });
    return mapped;
  });

  return { headers, rows };
}
