// Ported from apps/web/src/lib/ai/embeddings.ts for Edge Function use
// Uses fetch directly (no openai npm dependency needed in Deno)

const OPENAI_EMBEDDING_URL = "https://api.openai.com/v1/embeddings";
const MODEL = "text-embedding-3-small";

function getOpenAIKey(): string | undefined {
  return (
    Deno.env.get("OPENAI_RESEARCH_TIMEKEEPER_KEY") ??
    Deno.env.get("OPENAI_API_KEY")
  );
}

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = getOpenAIKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(OPENAI_EMBEDDING_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: text,
      }),
    });

    if (!response.ok) {
      console.error("Embedding API error:", response.status, await response.text());
      return null;
    }

    const data = await response.json();
    return data?.data?.[0]?.embedding ?? null;
  } catch (err) {
    console.error("Embedding error:", err);
    return null;
  }
}
