"use server";

import {
  hybridSearch,
  boostedHybridSearch,
  chunksBySourceIds,
} from "@/lib/db/queries/search";
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

  let chunks =
    boostIds.length > 0
      ? await boostedHybridSearch(question, boostIds, 8)
      : await hybridSearch(question, 6);

  // Fallback: if search found nothing but we have linked sources, fetch their chunks directly
  if (chunks.length === 0 && boostIds.length > 0) {
    chunks = await chunksBySourceIds(boostIds, 12);
  }

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
