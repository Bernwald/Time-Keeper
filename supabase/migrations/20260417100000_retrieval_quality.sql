-- Migration: retrieval_quality
-- Persistiert Retrieval-Telemetrie pro Assistant-Message und fuehrt eine
-- Admin-Review-Tabelle ein, aus der sich die "Trefferquote" (Verdict-Rate)
-- sowie der Ursachen-Breakdown (prompt/data/retrieval/llm/oos/ambiguous)
-- aggregieren lassen. Pflichtlektuere: docs/strategie.md Prinzip 3
-- ("Auditierbar by default. KPI-Tracking ist Pflicht.")

-- ── 1. chat_messages erweitern ─────────────────────────────────────────
--
-- Alle Felder nullable, damit historische Nachrichten unberuehrt bleiben.
-- Die retrieved_via-Tags werden heute nur in-memory vergeben
-- (apps/web/src/app/chat/actions.ts::tagChunks) und gingen beim Insert
-- verloren. Ab jetzt landen sie hier als Histogramm.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS chunk_ids        uuid[],
  ADD COLUMN IF NOT EXISTS retrieval_arms   jsonb,
  ADD COLUMN IF NOT EXISTS boost_source_ids uuid[],
  ADD COLUMN IF NOT EXISTS latency_ms       integer,
  ADD COLUMN IF NOT EXISTS chunks_retrieved integer;

-- Partial-Index nur auf Assistant-Messages — User-Messages tauchen in der
-- Review-Queue nie auf, also muss der Index sie nicht abdecken.
CREATE INDEX IF NOT EXISTS chat_messages_assistant_org_created_idx
  ON public.chat_messages (organization_id, created_at DESC)
  WHERE role = 'assistant';

-- ── 2. Review-Tabelle ──────────────────────────────────────────────────
--
-- 1 Review pro (message, reviewer). Unique-Constraint erzwingt das, die
-- Server-Action macht daraus ein Upsert. Verdict + Root-Cause sind Text-
-- Enums statt echter Enums, damit wir sie ohne Migration erweitern
-- koennten — der CHECK haelt sie trotzdem sauber.

CREATE TABLE IF NOT EXISTS public.chat_message_reviews (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  reviewer_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verdict          text NOT NULL CHECK (verdict IN ('correct','partial','hallucination','empty')),
  root_cause       text CHECK (root_cause IN ('prompt','data_quality','retrieval','llm','out_of_scope','ambiguous_question')),
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, reviewer_id)
);

CREATE INDEX IF NOT EXISTS chat_message_reviews_org_created_idx
  ON public.chat_message_reviews (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_message_reviews_message_idx
  ON public.chat_message_reviews (message_id);

-- updated_at Trigger
CREATE OR REPLACE FUNCTION public.touch_chat_message_review()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_message_reviews_touch ON public.chat_message_reviews;
CREATE TRIGGER chat_message_reviews_touch
BEFORE UPDATE ON public.chat_message_reviews
FOR EACH ROW EXECUTE FUNCTION public.touch_chat_message_review();

-- ── 3. RLS ─────────────────────────────────────────────────────────────
--
-- Reviews sind NUR fuer Platform-Admins (Berater). Kunden sollen weder
-- lesen noch schreiben koennen — ihre eigene Bewertung soll nicht das
-- offizielle Ground-Truth-Signal sein. Strategie.md: "Berater-First".

ALTER TABLE public.chat_message_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_message_reviews_admin_all" ON public.chat_message_reviews;
CREATE POLICY "chat_message_reviews_admin_all"
  ON public.chat_message_reviews FOR ALL
  USING      (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ── 4. Aggregat-Funktion ───────────────────────────────────────────────
--
-- SECURITY DEFINER-Funktion statt View — so koennen wir im SQL-Body
-- explizit is_platform_admin() pruefen, umgehen kontrolliert RLS und
-- vermeiden die Supabase-Advisor-Warnung fuer SECURITY DEFINER-Views.
-- Aggregation pro Tag + Org fuer die letzten N Tage. Optional pro Org.

CREATE OR REPLACE FUNCTION public.admin_retrieval_quality_totals(
  days integer DEFAULT 30,
  target_org uuid DEFAULT NULL
)
RETURNS TABLE (
  reviewed          bigint,
  correct           bigint,
  partial           bigint,
  hallucination     bigint,
  empty             bigint,
  cause_prompt      bigint,
  cause_data        bigint,
  cause_retrieval   bigint,
  cause_llm         bigint,
  cause_oos         bigint,
  cause_ambiguous   bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)                                                     AS reviewed,
    count(*) FILTER (WHERE r.verdict = 'correct')                AS correct,
    count(*) FILTER (WHERE r.verdict = 'partial')                AS partial,
    count(*) FILTER (WHERE r.verdict = 'hallucination')          AS hallucination,
    count(*) FILTER (WHERE r.verdict = 'empty')                  AS empty,
    count(*) FILTER (WHERE r.root_cause = 'prompt')              AS cause_prompt,
    count(*) FILTER (WHERE r.root_cause = 'data_quality')        AS cause_data,
    count(*) FILTER (WHERE r.root_cause = 'retrieval')           AS cause_retrieval,
    count(*) FILTER (WHERE r.root_cause = 'llm')                 AS cause_llm,
    count(*) FILTER (WHERE r.root_cause = 'out_of_scope')        AS cause_oos,
    count(*) FILTER (WHERE r.root_cause = 'ambiguous_question')  AS cause_ambiguous
  FROM public.chat_message_reviews r
  JOIN public.chat_messages m ON m.id = r.message_id
  WHERE public.is_platform_admin()
    AND r.created_at >= now() - make_interval(days => days)
    AND (target_org IS NULL OR m.organization_id = target_org);
$$;

REVOKE ALL ON FUNCTION public.admin_retrieval_quality_totals(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_retrieval_quality_totals(integer, uuid) TO authenticated;

-- Passiv-Signale (keine Reviews noetig) — zaehlen Assistant-Messages
-- direkt aus chat_messages.
CREATE OR REPLACE FUNCTION public.admin_retrieval_passive_signals(
  days integer DEFAULT 30,
  target_org uuid DEFAULT NULL
)
RETURNS TABLE (
  total_messages    bigint,
  zero_chunks       bigint,
  avg_chunks        numeric,
  p95_latency_ms    numeric,
  arm_mix           jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH msgs AS (
    SELECT chunks_retrieved, latency_ms, retrieval_arms
    FROM public.chat_messages
    WHERE public.is_platform_admin()
      AND role = 'assistant'
      AND created_at >= now() - make_interval(days => days)
      AND (target_org IS NULL OR organization_id = target_org)
  ),
  arm_counts AS (
    SELECT key AS arm, sum((value)::bigint) AS total
    FROM msgs, jsonb_each_text(COALESCE(retrieval_arms, '{}'::jsonb))
    WHERE retrieval_arms IS NOT NULL
    GROUP BY key
  )
  SELECT
    (SELECT count(*) FROM msgs)                                                  AS total_messages,
    (SELECT count(*) FROM msgs WHERE chunks_retrieved = 0)                       AS zero_chunks,
    (SELECT round(avg(chunks_retrieved)::numeric, 2) FROM msgs
       WHERE chunks_retrieved IS NOT NULL)                                       AS avg_chunks,
    (SELECT round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric, 0)
       FROM msgs WHERE latency_ms IS NOT NULL)                                   AS p95_latency_ms,
    (SELECT COALESCE(jsonb_object_agg(arm, total), '{}'::jsonb) FROM arm_counts) AS arm_mix;
$$;

REVOKE ALL ON FUNCTION public.admin_retrieval_passive_signals(integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_retrieval_passive_signals(integer, uuid) TO authenticated;
