// Ported from apps/web/src/lib/content/chunker.ts for Edge Function use

export type Chunk = {
  chunkIndex: number;
  chunkText: string;
  charStart: number;
  charEnd: number;
  tokenCount: number;
};

const CHUNK_SIZE = 500; // target words per chunk
const OVERLAP = 50; // words overlap between chunks

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/([.!?])\s+/g, "$1\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function splitIntoChunks(text: string): Chunk[] {
  if (!text.trim()) return [];

  const sentences = splitSentences(text);
  const chunks: Chunk[] = [];
  let currentWords: string[] = [];
  let chunkIndex = 0;
  let charPos = 0;
  let chunkStartChar = 0;

  for (const sentence of sentences) {
    const words = sentence.split(/\s+/).filter(Boolean);
    currentWords.push(...words);
    charPos += sentence.length + 1;

    if (countWords(currentWords.join(" ")) >= CHUNK_SIZE) {
      const chunkText = currentWords.join(" ");
      chunks.push({
        chunkIndex,
        chunkText,
        charStart: chunkStartChar,
        charEnd: chunkStartChar + chunkText.length,
        tokenCount: Math.ceil(chunkText.length / 4),
      });
      chunkIndex++;

      const overlapWords = currentWords.slice(-OVERLAP);
      chunkStartChar =
        chunkStartChar + chunkText.length - overlapWords.join(" ").length;
      currentWords = overlapWords;
    }
  }

  if (currentWords.length > 0) {
    const chunkText = currentWords.join(" ");
    chunks.push({
      chunkIndex,
      chunkText,
      charStart: chunkStartChar,
      charEnd: chunkStartChar + chunkText.length,
      tokenCount: Math.ceil(chunkText.length / 4),
    });
  }

  return chunks;
}

export { countWords };
