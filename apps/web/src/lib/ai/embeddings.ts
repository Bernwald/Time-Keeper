// Graceful: returns null / nulls if no OpenAI key is set

function getOpenAIKey(): string | undefined {
  return process.env.OPENAI_RESEARCH_TIMEKEEPER_KEY ?? process.env.OPENAI_API_KEY;
}

const EMBED_MODEL = "text-embedding-3-small";
// OpenAI accepts up to 2048 inputs per request; stay well below to leave headroom for token limits.
const BATCH_SIZE = 96;

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = getOpenAIKey();
  if (!apiKey) return null;

  try {
    const { OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });
    const response = await client.embeddings.create({
      model: EMBED_MODEL,
      input: text,
    });
    return response.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

/**
 * Batch-embed a list of texts. Returns an array aligned with the input;
 * slots are null when no API key is set or a batch fails.
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  if (texts.length === 0) return [];
  const apiKey = getOpenAIKey();
  if (!apiKey) return texts.map(() => null);

  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });
  const out: (number[] | null)[] = new Array(texts.length).fill(null);

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const slice = texts.slice(start, start + BATCH_SIZE);
    try {
      const response = await client.embeddings.create({
        model: EMBED_MODEL,
        input: slice,
      });
      for (let i = 0; i < slice.length; i++) {
        out[start + i] = response.data[i]?.embedding ?? null;
      }
    } catch {
      // leave the slice as null — caller can retry or accept missing embeddings
    }
  }

  return out;
}

export function getOpenAIKeyForChat(): string | undefined {
  return getOpenAIKey();
}

export function hasEmbeddingKey(): boolean {
  return !!getOpenAIKey();
}
