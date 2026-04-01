import type { ChunkSearchResult } from "@/lib/db/queries/search";
import { getOpenAIKeyForChat } from "./embeddings";

export type ModelId = "claude" | "gpt-4o" | "gpt-4o-mini";

export type ChatResponse =
  | { type: "chunks"; items: ChunkSearchResult[] }
  | { type: "answer"; text: string; sources: ChunkSearchResult[]; model: ModelId };

const SYSTEM_PROMPT =
  "Du bist ein hilfreicher Assistent der Fragen auf Basis der bereitgestellten Quellen beantwortet. Antworte präzise und nenne die Quellen.";

function buildUserPrompt(
  question: string,
  chunks: ChunkSearchResult[],
  entityContext?: string,
): string {
  const context = chunks
    .map((c, i) => `[Quelle ${i + 1}: ${c.source_title}]\n${c.chunk_text}`)
    .join("\n\n---\n\n");

  const entityHint = entityContext
    ? `\n\nDie Frage bezieht sich auf: ${entityContext}. Bevorzuge Informationen die mit diesen Entitäten verknüpft sind.`
    : "";

  return `${SYSTEM_PROMPT}${entityHint}\n\nQuellen:\n${context}\n\nFrage: ${question}\n\nAntworte präzise und nenne die Quellen.`;
}

async function answerWithClaude(
  prompt: string,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");
}

async function answerWithOpenAI(
  prompt: string,
  model: "gpt-4o" | "gpt-4o-mini",
): Promise<string | null> {
  const apiKey = getOpenAIKeyForChat();
  if (!apiKey) return null;

  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    max_tokens: 1024,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
  });

  return response.choices[0]?.message?.content ?? null;
}

export async function generateAnswer(
  question: string,
  chunks: ChunkSearchResult[],
  entityContext?: string,
  model: ModelId = "claude",
): Promise<ChatResponse> {
  if (chunks.length === 0) {
    return { type: "chunks", items: chunks };
  }

  const prompt = buildUserPrompt(question, chunks, entityContext);

  try {
    let text: string | null = null;

    if (model === "claude") {
      text = await answerWithClaude(prompt);
    } else {
      text = await answerWithOpenAI(prompt, model);
    }

    if (!text) {
      return { type: "chunks", items: chunks };
    }

    return { type: "answer", text, sources: chunks, model };
  } catch {
    return { type: "chunks", items: chunks };
  }
}

export function availableModels(): { id: ModelId; label: string; available: boolean }[] {
  return [
    { id: "claude", label: "Claude Sonnet", available: !!process.env.ANTHROPIC_API_KEY },
    { id: "gpt-4o", label: "GPT-4o", available: !!getOpenAIKeyForChat() },
    { id: "gpt-4o-mini", label: "GPT-4o mini", available: !!getOpenAIKeyForChat() },
  ];
}
