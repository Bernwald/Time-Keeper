import type { ChunkSearchResult } from "@/lib/db/queries/search";

export type ChatResponse =
  | { type: "chunks"; items: ChunkSearchResult[] }
  | { type: "answer"; text: string; sources: ChunkSearchResult[] };

// Graceful: uses LLM if ANTHROPIC_API_KEY is set, otherwise returns relevant chunks
export async function generateAnswer(
  question: string,
  chunks: ChunkSearchResult[]
): Promise<ChatResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey || chunks.length === 0) {
    return { type: "chunks", items: chunks };
  }

  try {
    const { Anthropic } = await import("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey });

    const context = chunks
      .map((c, i) => `[Quelle ${i + 1}: ${c.source_title}]\n${c.chunk_text}`)
      .join("\n\n---\n\n");

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Du bist ein hilfreicher Assistent der Fragen auf Basis der folgenden Quellen beantwortet.\n\nQuellen:\n${context}\n\nFrage: ${question}\n\nAntworte präzise und nenne die Quellen.`,
        },
      ],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    return { type: "answer", text, sources: chunks };
  } catch {
    return { type: "chunks", items: chunks };
  }
}

export function hasChatKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
