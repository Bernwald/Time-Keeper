// Deterministic text chunker for the embed worker.
//
// Splits long text into overlapping chunks sized for an embedding model.
// Strategy (in order):
//   1. Split on blank lines (paragraphs).
//   2. If a paragraph is still too large, split on sentence boundaries.
//   3. If a sentence is still too large, hard-split on character window.
// Each emitted chunk carries its char_start/char_end into the original text
// so callers can reconstruct provenance.
//
// Token estimation uses the same Math.ceil(len/4) heuristic the embed worker
// has been using — good enough for budgeting, no tokenizer dependency.

export interface Chunk {
  index:      number;
  text:       string;
  charStart:  number;
  charEnd:    number;
  tokenCount: number;
}

export interface ChunkOptions {
  // Target tokens per chunk. text-embedding-3-small handles 8191, but smaller
  // chunks give better recall for RAG. Default ≈ 400 tokens ≈ 1600 chars.
  targetTokens?: number;
  // Overlap between adjacent chunks, in tokens. Default 50 ≈ 200 chars.
  overlapTokens?: number;
}

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function chunkText(input: string, opts: ChunkOptions = {}): Chunk[] {
  const targetTokens  = opts.targetTokens  ?? 400;
  const overlapTokens = opts.overlapTokens ?? 50;
  const targetChars   = targetTokens  * CHARS_PER_TOKEN;
  const overlapChars  = overlapTokens * CHARS_PER_TOKEN;

  const text = (input ?? "").trim();
  if (!text) return [];

  // Short input → single chunk, no work needed.
  if (text.length <= targetChars) {
    return [{
      index:      0,
      text,
      charStart:  0,
      charEnd:    text.length,
      tokenCount: estimateTokens(text),
    }];
  }

  // Step 1: split into atomic segments (paragraphs → sentences → hard cuts)
  // while remembering each segment's offset into the original text.
  const segments: Array<{ text: string; start: number }> = [];
  const paragraphs = splitWithOffsets(text, /\n\s*\n+/g);
  for (const para of paragraphs) {
    if (para.text.length <= targetChars) {
      segments.push(para);
      continue;
    }
    const sentences = splitWithOffsets(para.text, /(?<=[.!?])\s+/g, para.start);
    for (const sent of sentences) {
      if (sent.text.length <= targetChars) {
        segments.push(sent);
        continue;
      }
      // Last resort: hard window split.
      for (let i = 0; i < sent.text.length; i += targetChars) {
        segments.push({
          text:  sent.text.slice(i, i + targetChars),
          start: sent.start + i,
        });
      }
    }
  }

  // Step 2: greedily pack segments into chunks up to targetChars,
  // adding character-window overlap between adjacent chunks.
  const chunks: Chunk[] = [];
  let buffer     = "";
  let bufferStart = segments[0]?.start ?? 0;
  let bufferEnd   = bufferStart;

  const flush = () => {
    const trimmed = buffer.trim();
    if (!trimmed) {
      buffer = "";
      return;
    }
    chunks.push({
      index:      chunks.length,
      text:       trimmed,
      charStart:  bufferStart,
      charEnd:    bufferEnd,
      tokenCount: estimateTokens(trimmed),
    });
    buffer = "";
  };

  for (const seg of segments) {
    // If adding this segment would exceed the budget, flush first.
    if (buffer.length > 0 && buffer.length + 1 + seg.text.length > targetChars) {
      flush();
      // Seed the next buffer with overlap from the just-emitted chunk.
      if (overlapChars > 0 && chunks.length > 0) {
        const last = chunks[chunks.length - 1];
        const tail = last.text.slice(-overlapChars);
        buffer      = tail;
        bufferStart = Math.max(0, last.charEnd - tail.length);
        bufferEnd   = last.charEnd;
      } else {
        bufferStart = seg.start;
        bufferEnd   = seg.start;
      }
    }
    if (buffer.length === 0) {
      bufferStart = seg.start;
    }
    buffer    += (buffer.length > 0 ? "\n" : "") + seg.text;
    bufferEnd  = seg.start + seg.text.length;
  }
  flush();

  return chunks;
}

// Split `text` on `pattern`, returning each piece with its absolute start
// offset (relative to the original input — `baseOffset` lets callers preserve
// nesting offsets when re-splitting a sub-segment).
function splitWithOffsets(
  text:       string,
  pattern:    RegExp,
  baseOffset: number = 0,
): Array<{ text: string; start: number }> {
  const out: Array<{ text: string; start: number }> = [];
  let cursor = 0;
  // Ensure the regex is global so exec() advances lastIndex.
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const piece = text.slice(cursor, match.index);
    if (piece.trim()) out.push({ text: piece, start: baseOffset + cursor });
    cursor = match.index + match[0].length;
  }
  const tail = text.slice(cursor);
  if (tail.trim()) out.push({ text: tail, start: baseOffset + cursor });
  return out;
}
