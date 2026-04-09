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
  if (!apiKey) {
    throw new Error("OPENAI key not set (OPENAI_RESEARCH_TIMEKEEPER_KEY or OPENAI_API_KEY)");
  }

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
    const body = await response.text();
    throw new Error(`OpenAI embeddings ${response.status}: ${body.slice(0, 500)}`);
  }

  const data = await response.json();
  const vec = data?.data?.[0]?.embedding;
  if (!vec) {
    throw new Error(`OpenAI embeddings: missing embedding in response: ${JSON.stringify(data).slice(0, 500)}`);
  }
  return vec;
}
