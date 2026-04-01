"use server";

import { fullTextSearch } from "@/lib/db/queries/search";
import { generateAnswer } from "@/lib/ai/chat";
import type { ChatResponse } from "@/lib/ai/chat";

export async function chatAnswer(question: string): Promise<ChatResponse> {
  const chunks = await fullTextSearch(question, 6);
  return generateAnswer(question, chunks);
}
