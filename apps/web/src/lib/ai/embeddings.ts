// Graceful: returns null if OPENAI_API_KEY is not set

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
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

export function hasEmbeddingKey(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
