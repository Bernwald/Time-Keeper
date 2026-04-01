// Graceful: returns null if no OpenAI key is set

function getOpenAIKey(): string | undefined {
  return process.env.OPENAI_RESEARCH_TIMEKEEPER_KEY ?? process.env.OPENAI_API_KEY;
}

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = getOpenAIKey();
  if (!apiKey) return null;

  try {
    const { OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });
    const response = await client.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    return response.data[0]?.embedding ?? null;
  } catch {
    return null;
  }
}

export function getOpenAIKeyForChat(): string | undefined {
  return getOpenAIKey();
}

export function hasEmbeddingKey(): boolean {
  return !!getOpenAIKey();
}
