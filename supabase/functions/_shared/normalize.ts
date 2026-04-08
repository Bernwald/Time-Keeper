// Generic payload → text helpers used by the catch-all normalizer.
//
// Provider-specific normalizers (like the Google Calendar one) produce
// curated text. For everything else we still want the data to land in the
// RAG layer — so we flatten the JSONB payload into a "key: value" block and
// hand that to the embed worker. Not as good as a hand-tuned normalizer, but
// infinitely better than dropping the row on the floor.

const MAX_FLATTENED_CHARS = 10_000;
const TITLE_KEYS = ["title", "name", "summary", "subject", "label", "headline"];

export interface FlattenedPayload {
  title: string;
  text:  string;
}

export function flattenPayloadToText(
  payload: Record<string, unknown>,
  fallbackTitle: string,
): FlattenedPayload {
  const title = pickTitle(payload) ?? fallbackTitle;
  const lines: string[] = [];
  walk(payload, "", lines);

  let text = lines.join("\n").trim();
  if (text.length > MAX_FLATTENED_CHARS) {
    // Hard cap before chunking — keeps embed worker bounded.
    text = text.slice(0, MAX_FLATTENED_CHARS);
  }
  return { title, text };
}

function pickTitle(payload: Record<string, unknown>): string | null {
  for (const key of TITLE_KEYS) {
    const v = payload[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function walk(value: unknown, path: string, out: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const v = value.trim();
    if (v) out.push(path ? `${path}: ${v}` : v);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push(path ? `${path}: ${value}` : String(value));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, path ? `${path}[${i}]` : `[${i}]`, out));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(v, path ? `${path}.${k}` : k, out);
    }
  }
}
