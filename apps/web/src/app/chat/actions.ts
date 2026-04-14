"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createUserClient } from "@/lib/db/supabase-server";
import { requireOrgId } from "@/lib/db/org-context";
import {
  hybridSearch,
  boostedHybridSearch,
  chunksBySourceIds,
  searchOperationalEntities,
  listAllChunksByType,
  type ChunkSearchResult,
} from "@/lib/db/queries/search";
import { resolveEntities, getBoostSourceIds } from "@/lib/ai/entity-resolver";
import {
  generateAnswer,
  rewriteFollowUpQuery,
  generateChatTitle,
  availableModels,
  type ChatResponse,
  type ChatTurn,
  type ModelId,
} from "@/lib/ai/chat";

export type ConversationListItem = {
  id: string;
  title: string;
  last_message_at: string;
  model: string | null;
};

export type StoredMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  sources: unknown[];
  model: string | null;
  created_at: string;
};

const RETRIEVAL_LIMIT = 14; // bumped from 6 — listing-questions need headroom
const LISTING_LIMIT   = 80; // exhaustive fetch for "alle ..."-style questions
const HISTORY_WINDOW  = 10; // last N turns sent to the model

// Detects listing/counting questions where we must bypass relevance ranking
// and fetch every matching row, otherwise long transcripts crowd out short
// entity-sources and we silently drop contacts/companies.
function detectListingIntent(q: string): {
  isListing: boolean;
  types: string[];
} {
  const s = q.toLowerCase();
  const listing =
    /\b(alle|welche|wie\s*viele|liste|zeige|show|list|how\s*many)\b/.test(s);
  if (!listing) return { isListing: false, types: [] };

  const types: string[] = [];
  if (/kontakt|vertrieb|ansprech|lead|warm|kalt|lauwarm/.test(s)) types.push("text");
  if (/gespr(ä|ae)ch|transcript|meeting|call/.test(s)) types.push("transcript");
  if (/dokument|datei|pdf|doc/.test(s)) types.push("document");
  // Default: if the user asks "alle/welche" without a type → include short
  // entity-style sources (text) plus documents.
  if (types.length === 0) types.push("text", "document");
  return { isListing: true, types };
}

function dedupeChunks(chunks: ChunkSearchResult[]): ChunkSearchResult[] {
  const seen = new Set<string>();
  const out: ChunkSearchResult[] = [];
  for (const c of chunks) {
    const key = `${c.source_id}:${c.chunk_index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// Attach a diagnostic `retrieved_via` tag to each chunk so the admin debug
// panel can show which retrieval arm surfaced it. Kept separate from the
// SQL layer because several retrievers are called from JS, not from within
// a single RPC.
function tagChunks(
  chunks: ChunkSearchResult[],
  via: NonNullable<ChunkSearchResult["retrieved_via"]>,
): ChunkSearchResult[] {
  return chunks.map((c) => ({ ...c, retrieved_via: c.retrieved_via ?? via }));
}

// ── Conversations ────────────────────────────────────────────────────────

export async function createConversation(): Promise<string> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data: { user } } = await db.auth.getUser();

  const { data, error } = await db
    .from("chat_conversations")
    .insert({
      organization_id: orgId,
      created_by: user?.id ?? null,
      title: "Neuer Chat",
    })
    .select("id")
    .single();

  if (error) throw error;
  revalidatePath("/chat", "layout");
  return data!.id as string;
}

export async function listConversations(limit = 50): Promise<ConversationListItem[]> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { data, error } = await db
    .from("chat_conversations")
    .select("id, title, last_message_at, model")
    .eq("organization_id", orgId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ConversationListItem[];
}

export async function getConversation(id: string): Promise<{
  conversation: ConversationListItem;
  messages: StoredMessage[];
} | null> {
  const orgId = await requireOrgId();
  const db = await createUserClient();

  const { data: conv, error: convErr } = await db
    .from("chat_conversations")
    .select("id, title, last_message_at, model")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();
  if (convErr || !conv) return null;

  const { data: msgs, error: msgErr } = await db
    .from("chat_messages")
    .select("id, role, content, sources, model, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });
  if (msgErr) throw msgErr;

  return {
    conversation: conv as ConversationListItem,
    messages: (msgs ?? []) as StoredMessage[],
  };
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { error } = await db
    .from("chat_conversations")
    .update({ title: title.slice(0, 200) })
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) throw error;
  revalidatePath("/chat", "layout");
}

export async function deleteConversation(id: string): Promise<void> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const { error } = await db
    .from("chat_conversations")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  if (error) throw error;
  revalidatePath("/chat", "layout");
  redirect("/chat");
}

// ── Messaging ────────────────────────────────────────────────────────────

export async function sendMessage(
  conversationId: string,
  question: string,
  model: ModelId = "claude",
): Promise<ChatResponse> {
  const orgId = await requireOrgId();
  const db = await createUserClient();
  const trimmed = question.trim();
  if (!trimmed) return { type: "chunks", items: [] };

  // Resolve current user for permission-filtered search
  const { data: { user } } = await db.auth.getUser();
  const userId = user?.id;

  // 1. Load history
  const { data: historyRows } = await db
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const allHistory = (historyRows ?? []).filter(
    (m): m is { role: "user" | "assistant"; content: string; created_at: string } =>
      m.role === "user" || m.role === "assistant",
  );

  // 2. Persist user message immediately so the UI can show it on retry/refresh
  await db.from("chat_messages").insert({
    conversation_id: conversationId,
    organization_id: orgId,
    role: "user",
    content: trimmed,
  });

  // 3. Query rewrite for multi-turn retrieval
  const history: ChatTurn[] = allHistory
    .slice(-HISTORY_WINDOW)
    .map((m) => ({ role: m.role, content: m.content }));

  const searchQuery = await rewriteFollowUpQuery(trimmed, history);

  // 4. Entity-aware retrieval
  const entities = await resolveEntities(searchQuery);
  const boostIds = await getBoostSourceIds(entities);

  const listing = detectListingIntent(trimmed);

  // For listing/counting questions we MUST bypass relevance ranking,
  // otherwise a long transcript can crowd out short entity sources
  // (e.g. 1 transcript source produces more chunks than 8 contact sources,
  //  so hybrid ranking leaves some contacts out of the context window).
  const [knowledgeChunks, opEntities, exhaustive] = await Promise.all([
    boostIds.length > 0
      ? boostedHybridSearch(searchQuery, boostIds, RETRIEVAL_LIMIT, userId)
      : hybridSearch(searchQuery, RETRIEVAL_LIMIT, userId),
    searchOperationalEntities(searchQuery, 100, listing.isListing ? "exhaustive" : "search"),
    listing.isListing
      ? listAllChunksByType(listing.types, LISTING_LIMIT, userId)
      : Promise.resolve([] as ChunkSearchResult[]),
  ]);

  // Order matters: exhaustive first so the LLM sees the complete set,
  // then semantically relevant extras. Tag each source so the debug panel
  // can show which retrieval arm surfaced each chunk.
  let chunks = dedupeChunks([
    ...tagChunks(exhaustive, "listing"),
    ...tagChunks(opEntities, "operational"),
    ...tagChunks(knowledgeChunks, boostIds.length > 0 ? "boost" : "hybrid"),
  ]);

  if (chunks.length === 0 && boostIds.length > 0) {
    chunks = tagChunks(
      await chunksBySourceIds(boostIds, RETRIEVAL_LIMIT, userId),
      "fallback",
    );
  }

  const entityContext =
    entities.length > 0
      ? entities.map((e) => `${e.name} (${e.type})`).join(", ")
      : undefined;

  // 5. Generate answer (multi-turn, with system prompt)
  const response = await generateAnswer({
    history,
    question: trimmed,
    chunks,
    entityContext,
    rewrittenQuery: searchQuery !== trimmed ? searchQuery : undefined,
    model,
  });

  // 6. Persist assistant message
  if (response.type === "answer") {
    await db.from("chat_messages").insert({
      conversation_id: conversationId,
      organization_id: orgId,
      role: "assistant",
      content: response.text,
      sources: response.sources as unknown as object[],
      model: response.model,
      entity_context: entityContext ?? null,
      rewritten_query: response.rewrittenQuery ?? null,
    });
  } else {
    // chunks-only fallback (LLM unavailable) — store as a system note
    await db.from("chat_messages").insert({
      conversation_id: conversationId,
      organization_id: orgId,
      role: "assistant",
      content: "(LLM nicht verfuegbar — relevante Abschnitte werden angezeigt.)",
      sources: response.items as unknown as object[],
      model,
      entity_context: entityContext ?? null,
      rewritten_query: searchQuery !== trimmed ? searchQuery : null,
    });
  }

  // 7. Auto-title on first turn
  if (allHistory.length === 0) {
    const title = await generateChatTitle(trimmed);
    await db
      .from("chat_conversations")
      .update({ title, model })
      .eq("id", conversationId)
      .eq("organization_id", orgId);
  }

  revalidatePath("/chat", "layout");
  return response;
}

export async function getAvailableModels() {
  return availableModels();
}
