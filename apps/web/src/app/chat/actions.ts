"use server";

import { hybridSearch, boostedHybridSearch } from "@/lib/db/queries/search";
import { resolveEntities, getBoostSourceIds } from "@/lib/ai/entity-resolver";
import { generateAnswer, availableModels } from "@/lib/ai/chat";
import type { ChatResponse, ModelId } from "@/lib/ai/chat";

export async function chatAnswer(
  question: string,
  model: ModelId = "claude",
): Promise<ChatResponse> {
  // Resolve entity mentions for context-aware boosting
  const entities = await resolveEntities(question);
  const boostIds = await getBoostSourceIds(entities);

  const chunks =
    boostIds.length > 0
      ? await boostedHybridSearch(question, boostIds, 8)
      : await hybridSearch(question, 6);

  // Enrich prompt context with matched entities
  const entityContext =
    entities.length > 0
      ? entities.map((e) => `${e.name} (${e.type})`).join(", ")
      : undefined;

  return generateAnswer(question, chunks, entityContext, model);
}

export async function getAvailableModels() {
  return availableModels();
}
