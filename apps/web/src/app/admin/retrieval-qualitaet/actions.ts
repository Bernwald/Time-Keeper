"use server";

import { revalidatePath } from "next/cache";
import { isPlatformAdmin } from "@/lib/db/queries/organization";
import { createServiceClient, getUser } from "@/lib/db/supabase-server";

export type Verdict = "correct" | "partial" | "hallucination" | "empty";
export type RootCause =
  | "prompt"
  | "data_quality"
  | "retrieval"
  | "llm"
  | "out_of_scope"
  | "ambiguous_question";

async function requireAdmin() {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) throw new Error("Unauthorized");
}

// ── Review submit (upsert) ─────────────────────────────────────────────

export async function submitReview(input: {
  messageId: string;
  verdict: Verdict;
  rootCause: RootCause | null;
  notes: string;
}): Promise<void> {
  await requireAdmin();
  const user = await getUser();
  if (!user) throw new Error("Unauthorized");

  const db = createServiceClient();

  // Resolve organization_id from the message — never trust the client.
  const { data: msg, error: msgErr } = await db
    .from("chat_messages")
    .select("organization_id, role")
    .eq("id", input.messageId)
    .single();
  if (msgErr || !msg) throw new Error("Message nicht gefunden");
  if (msg.role !== "assistant") {
    throw new Error("Nur Assistant-Messages koennen bewertet werden");
  }

  // root_cause is only meaningful when the verdict is not 'correct'.
  const rootCause = input.verdict === "correct" ? null : input.rootCause;

  const { error } = await db
    .from("chat_message_reviews")
    .upsert(
      {
        message_id: input.messageId,
        organization_id: msg.organization_id,
        reviewer_id: user.id,
        verdict: input.verdict,
        root_cause: rootCause,
        notes: input.notes.trim() || null,
      },
      { onConflict: "message_id,reviewer_id" },
    );
  if (error) throw error;

  revalidatePath("/admin/retrieval-qualitaet");
  revalidatePath(`/admin/retrieval-qualitaet/${input.messageId}`);
}

// ── List for review queue ──────────────────────────────────────────────

export type ReviewableMessage = {
  id: string;
  created_at: string;
  organization_id: string;
  organization_name: string | null;
  conversation_id: string;
  question: string | null;
  answer_preview: string;
  chunks_retrieved: number | null;
  latency_ms: number | null;
  retrieval_arms: Record<string, number> | null;
  my_verdict: Verdict | null;
  total_reviews: number;
};

export type ListFilters = {
  onlyUnreviewed?: boolean;
  onlyZeroChunks?: boolean;
  organizationId?: string | null;
  limit?: number;
  offset?: number;
};

export async function listReviewableMessages(
  filters: ListFilters = {},
): Promise<ReviewableMessage[]> {
  await requireAdmin();
  const user = await getUser();
  if (!user) return [];

  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  const db = createServiceClient();

  // Build the main query on assistant messages. We separately fetch the
  // preceding user-turn as a "question" and the review aggregates.
  let query = db
    .from("chat_messages")
    .select(
      "id, created_at, organization_id, conversation_id, content, chunks_retrieved, latency_ms, retrieval_arms",
    )
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (filters.organizationId) {
    query = query.eq("organization_id", filters.organizationId);
  }
  if (filters.onlyZeroChunks) {
    query = query.eq("chunks_retrieved", 0);
  }

  const { data: rows, error } = await query;
  if (error) throw error;
  if (!rows || rows.length === 0) return [];

  const messageIds = rows.map((r) => r.id);
  const convIds = Array.from(new Set(rows.map((r) => r.conversation_id)));
  const orgIds = Array.from(new Set(rows.map((r) => r.organization_id)));

  // Fetch reviews, org names, and preceding user messages in parallel.
  const [reviewsRes, orgsRes, historyRes] = await Promise.all([
    db
      .from("chat_message_reviews")
      .select("message_id, reviewer_id, verdict")
      .in("message_id", messageIds),
    db.from("organizations").select("id, name").in("id", orgIds),
    db
      .from("chat_messages")
      .select("id, conversation_id, role, content, created_at")
      .in("conversation_id", convIds)
      .eq("role", "user")
      .order("created_at", { ascending: true }),
  ]);

  const reviews = reviewsRes.data ?? [];
  const orgs = orgsRes.data ?? [];
  const history = historyRes.data ?? [];

  const orgName = new Map(orgs.map((o) => [o.id, o.name as string]));
  const reviewCountByMsg = new Map<string, number>();
  const myVerdictByMsg = new Map<string, Verdict>();
  for (const r of reviews) {
    reviewCountByMsg.set(
      r.message_id,
      (reviewCountByMsg.get(r.message_id) ?? 0) + 1,
    );
    if (r.reviewer_id === user.id) {
      myVerdictByMsg.set(r.message_id, r.verdict as Verdict);
    }
  }

  // Group user-turns per conversation to find the last one BEFORE each
  // assistant message.
  const userTurnsByConv = new Map<
    string,
    Array<{ created_at: string; content: string }>
  >();
  for (const h of history) {
    const arr = userTurnsByConv.get(h.conversation_id) ?? [];
    arr.push({ created_at: h.created_at, content: h.content });
    userTurnsByConv.set(h.conversation_id, arr);
  }

  const result: ReviewableMessage[] = rows.map((r) => {
    const convTurns = userTurnsByConv.get(r.conversation_id) ?? [];
    const precedingUser = [...convTurns]
      .reverse()
      .find((t) => t.created_at < r.created_at);

    const item: ReviewableMessage = {
      id: r.id,
      created_at: r.created_at,
      organization_id: r.organization_id,
      organization_name: orgName.get(r.organization_id) ?? null,
      conversation_id: r.conversation_id,
      question: precedingUser?.content ?? null,
      answer_preview: ((r.content as string) ?? "").slice(0, 220),
      chunks_retrieved: r.chunks_retrieved,
      latency_ms: r.latency_ms,
      retrieval_arms:
        (r.retrieval_arms as Record<string, number> | null) ?? null,
      my_verdict: myVerdictByMsg.get(r.id) ?? null,
      total_reviews: reviewCountByMsg.get(r.id) ?? 0,
    };
    return item;
  });

  if (filters.onlyUnreviewed) {
    return result.filter((r) => r.total_reviews === 0);
  }
  return result;
}

// ── KPI aggregates ─────────────────────────────────────────────────────

export type RetrievalQualityTotals = {
  reviewed: number;
  correct: number;
  partial: number;
  hallucination: number;
  empty: number;
  cause_prompt: number;
  cause_data: number;
  cause_retrieval: number;
  cause_llm: number;
  cause_oos: number;
  cause_ambiguous: number;
};

export type PassiveSignals = {
  total_messages: number;
  zero_chunks: number;
  avg_chunks: number | null;
  p95_latency_ms: number | null;
  arm_mix: Record<string, number>;
};

export async function getQualityTotals(
  days = 30,
  organizationId: string | null = null,
): Promise<RetrievalQualityTotals> {
  await requireAdmin();
  const db = createServiceClient();
  const { data, error } = await db.rpc("admin_retrieval_quality_totals", {
    days,
    target_org: organizationId,
  });
  if (error) throw error;
  const row = (data?.[0] ?? {}) as Partial<RetrievalQualityTotals>;
  return {
    reviewed: Number(row.reviewed ?? 0),
    correct: Number(row.correct ?? 0),
    partial: Number(row.partial ?? 0),
    hallucination: Number(row.hallucination ?? 0),
    empty: Number(row.empty ?? 0),
    cause_prompt: Number(row.cause_prompt ?? 0),
    cause_data: Number(row.cause_data ?? 0),
    cause_retrieval: Number(row.cause_retrieval ?? 0),
    cause_llm: Number(row.cause_llm ?? 0),
    cause_oos: Number(row.cause_oos ?? 0),
    cause_ambiguous: Number(row.cause_ambiguous ?? 0),
  };
}

export async function getPassiveSignals(
  days = 30,
  organizationId: string | null = null,
): Promise<PassiveSignals> {
  await requireAdmin();
  const db = createServiceClient();
  const { data, error } = await db.rpc("admin_retrieval_passive_signals", {
    days,
    target_org: organizationId,
  });
  if (error) throw error;
  const row = (data?.[0] ?? {}) as {
    total_messages?: number;
    zero_chunks?: number;
    avg_chunks?: number | null;
    p95_latency_ms?: number | null;
    arm_mix?: Record<string, number> | null;
  };
  return {
    total_messages: Number(row.total_messages ?? 0),
    zero_chunks: Number(row.zero_chunks ?? 0),
    avg_chunks: row.avg_chunks != null ? Number(row.avg_chunks) : null,
    p95_latency_ms:
      row.p95_latency_ms != null ? Number(row.p95_latency_ms) : null,
    arm_mix: row.arm_mix ?? {},
  };
}

// ── Detail ─────────────────────────────────────────────────────────────

export type ReviewDetail = {
  id: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  verdict: Verdict;
  root_cause: RootCause | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
};

export type MessageDetail = {
  id: string;
  created_at: string;
  organization_id: string;
  organization_name: string | null;
  conversation_id: string;
  conversation_title: string | null;
  model: string | null;
  content: string;
  question: string | null;
  entity_context: string | null;
  rewritten_query: string | null;
  chunks_retrieved: number | null;
  latency_ms: number | null;
  retrieval_arms: Record<string, number> | null;
  boost_source_ids: string[];
  chunks: Array<{
    id: string;
    source_id: string | null;
    source_title: string | null;
    chunk_index: number | null;
    text_preview: string;
  }>;
  reviews: ReviewDetail[];
};

export async function getMessageDetail(
  messageId: string,
): Promise<MessageDetail | null> {
  await requireAdmin();
  const user = await getUser();
  const db = createServiceClient();

  const { data: msg, error: msgErr } = await db
    .from("chat_messages")
    .select(
      "id, created_at, organization_id, conversation_id, role, content, model, entity_context, rewritten_query, chunks_retrieved, latency_ms, retrieval_arms, chunk_ids, boost_source_ids",
    )
    .eq("id", messageId)
    .single();
  if (msgErr || !msg || msg.role !== "assistant") return null;

  const chunkIds = ((msg.chunk_ids as string[] | null) ?? []).slice(0, 30);
  const boostIds = ((msg.boost_source_ids as string[] | null) ?? []);

  const [convRes, orgRes, questionRes, chunksRes, reviewsRes] = await Promise.all([
    db
      .from("chat_conversations")
      .select("id, title")
      .eq("id", msg.conversation_id)
      .single(),
    db
      .from("organizations")
      .select("id, name")
      .eq("id", msg.organization_id)
      .single(),
    db
      .from("chat_messages")
      .select("content, created_at")
      .eq("conversation_id", msg.conversation_id)
      .eq("role", "user")
      .lt("created_at", msg.created_at)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    chunkIds.length > 0
      ? db
          .from("content_chunks")
          .select("id, source_id, chunk_index, chunk_text")
          .in("id", chunkIds)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("chat_message_reviews")
      .select(
        "id, reviewer_id, verdict, root_cause, notes, created_at, updated_at",
      )
      .eq("message_id", messageId)
      .order("updated_at", { ascending: false }),
  ]);

  const rawChunks = (chunksRes.data ?? []) as Array<{
    id: string;
    source_id: string | null;
    chunk_index: number | null;
    chunk_text: string | null;
  }>;

  // Resolve source titles in a second query — the PostgREST embedded-FK
  // syntax (sources:source_id(title)) depends on FK naming conventions we
  // don't want to rely on here.
  const sourceIds = Array.from(
    new Set(rawChunks.map((c) => c.source_id).filter((x): x is string => !!x)),
  );
  const sourcesRes =
    sourceIds.length > 0
      ? await db.from("sources").select("id, title").in("id", sourceIds)
      : { data: [] };
  const sourceTitle = new Map(
    (sourcesRes.data ?? []).map(
      (s: { id: string; title: string | null }) => [s.id, s.title],
    ),
  );

  // Preserve the original chunk_ids order so the reviewer sees them in
  // retrieval order, not in DB-scan order.
  const chunkById = new Map(rawChunks.map((c) => [c.id, c]));
  const chunks = chunkIds
    .map((id) => chunkById.get(id))
    .filter((c): c is (typeof rawChunks)[number] => !!c)
    .map((c) => ({
      id: c.id,
      source_id: c.source_id,
      source_title: c.source_id ? sourceTitle.get(c.source_id) ?? null : null,
      chunk_index: c.chunk_index,
      text_preview: ((c.chunk_text as string) ?? "").slice(0, 500),
    }));

  // Resolve reviewer names from profiles
  const rawReviews =
    (reviewsRes.data as Array<{
      id: string;
      reviewer_id: string | null;
      verdict: Verdict;
      root_cause: RootCause | null;
      notes: string | null;
      created_at: string;
      updated_at: string;
    }>) ?? [];
  const reviewerIds = Array.from(
    new Set(rawReviews.map((r) => r.reviewer_id).filter((x): x is string => !!x)),
  );
  const profilesRes =
    reviewerIds.length > 0
      ? await db
          .from("profiles")
          .select("id, full_name, email")
          .in("id", reviewerIds)
      : { data: [] };
  const reviewerName = new Map(
    (profilesRes.data ?? []).map(
      (p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p.full_name ?? p.email ?? null,
      ],
    ),
  );

  const reviews: ReviewDetail[] = rawReviews.map((r) => ({
    id: r.id,
    reviewer_id: r.reviewer_id,
    reviewer_name: r.reviewer_id ? reviewerName.get(r.reviewer_id) ?? null : null,
    verdict: r.verdict,
    root_cause: r.root_cause,
    notes: r.notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
    is_mine: !!user && r.reviewer_id === user.id,
  }));

  return {
    id: msg.id,
    created_at: msg.created_at,
    organization_id: msg.organization_id,
    organization_name: orgRes.data?.name ?? null,
    conversation_id: msg.conversation_id,
    conversation_title: convRes.data?.title ?? null,
    model: msg.model,
    content: msg.content,
    question: questionRes.data?.content ?? null,
    entity_context: msg.entity_context,
    rewritten_query: msg.rewritten_query,
    chunks_retrieved: msg.chunks_retrieved,
    latency_ms: msg.latency_ms,
    retrieval_arms:
      (msg.retrieval_arms as Record<string, number> | null) ?? null,
    boost_source_ids: boostIds,
    chunks,
    reviews,
  };
}

// Organizations for filter dropdown
export async function listOrganizationsForFilter(): Promise<
  Array<{ id: string; name: string }>
> {
  await requireAdmin();
  const db = createServiceClient();
  const { data } = await db
    .from("organizations")
    .select("id, name")
    .order("name", { ascending: true });
  return (data ?? []) as Array<{ id: string; name: string }>;
}
