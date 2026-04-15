-- Fuzzy / typo-tolerant retrieval via pg_trgm.
--
-- FTS (to_tsvector) and embedding similarity both miss short proper nouns
-- with typos — "Elfach" will never match a chunk containing "Elfack". Adding
-- a third retrieval arm based on word_similarity (pg_trgm) lets us catch
-- those and fuse the three rankings via RRF.
--
-- Uses GIST instead of GIN so the word_similarity operator `<%` is indexable;
-- GIN supports `%` (global similarity) but not `<%`. For our chunk sizes
-- (~1600 chars) the global-similarity variant is useless because the typo
-- word is buried in thousands of unrelated chars.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GIST index so `<%` (word_similarity >= threshold) can use the index.
-- Safe to IF NOT EXISTS because the migration might be re-run during dev.
CREATE INDEX IF NOT EXISTS content_chunks_chunk_text_trgm_idx
  ON public.content_chunks
  USING GIST (chunk_text gist_trgm_ops);

-- ---------------------------------------------------------------------------
-- hybrid_search_chunks — fuse FTS + vector + trigram via RRF.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hybrid_search_chunks(
  p_org_id    UUID,
  p_query     TEXT,
  p_embedding VECTOR(1536),
  p_limit     INTEGER DEFAULT 10,
  p_user_id   UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID, source_id UUID, chunk_index INTEGER, chunk_text TEXT,
  source_title TEXT, source_type TEXT, rank REAL
)
LANGUAGE sql STABLE
SET pg_trgm.word_similarity_threshold = 0.4
AS $$
  WITH fts AS (
    SELECT c.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('german', c.chunk_text),
               to_or_tsquery('german', p_query)
             ) DESC
           ) AS rank_pos
    FROM public.content_chunks c
    JOIN public.sources s ON s.id = c.source_id
    WHERE c.organization_id = p_org_id
      AND to_tsvector('german', c.chunk_text) @@ to_or_tsquery('german', p_query)
      AND (
        p_user_id IS NULL
        OR s.folder_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.source_folder_access sfa
          JOIN public.permission_group_members pgm ON pgm.group_id = sfa.group_id
          WHERE sfa.folder_id = s.folder_id AND pgm.user_id = p_user_id
        )
      )
    LIMIT 30
  ),
  vec AS (
    SELECT c.id,
           ROW_NUMBER() OVER (ORDER BY c.embedding <=> p_embedding) AS rank_pos
    FROM public.content_chunks c
    JOIN public.sources s ON s.id = c.source_id
    WHERE c.organization_id = p_org_id
      AND c.embedding IS NOT NULL
      AND (
        p_user_id IS NULL
        OR s.folder_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.source_folder_access sfa
          JOIN public.permission_group_members pgm ON pgm.group_id = sfa.group_id
          WHERE sfa.folder_id = s.folder_id AND pgm.user_id = p_user_id
        )
      )
    ORDER BY c.embedding <=> p_embedding
    LIMIT 30
  ),
  trgm AS (
    SELECT c.id,
           ROW_NUMBER() OVER (ORDER BY word_similarity(p_query, c.chunk_text) DESC) AS rank_pos
    FROM public.content_chunks c
    JOIN public.sources s ON s.id = c.source_id
    WHERE c.organization_id = p_org_id
      AND p_query <% c.chunk_text
      AND (
        p_user_id IS NULL
        OR s.folder_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.source_folder_access sfa
          JOIN public.permission_group_members pgm ON pgm.group_id = sfa.group_id
          WHERE sfa.folder_id = s.folder_id AND pgm.user_id = p_user_id
        )
      )
    ORDER BY word_similarity(p_query, c.chunk_text) DESC
    LIMIT 30
  ),
  combined AS (
    SELECT chunk_id, SUM(score)::REAL AS rrf_score
    FROM (
      SELECT id AS chunk_id, 1.0 / (60.0 + rank_pos) AS score FROM fts
      UNION ALL
      SELECT id,             1.0 / (60.0 + rank_pos)            FROM vec
      UNION ALL
      SELECT id,             1.0 / (60.0 + rank_pos)            FROM trgm
    ) u
    GROUP BY chunk_id
  )
  SELECT c.id, c.source_id, c.chunk_index, c.chunk_text,
         s.title AS source_title, s.source_type,
         cb.rrf_score AS rank
  FROM combined cb
  JOIN public.content_chunks c ON c.id = cb.chunk_id
  JOIN public.sources s ON s.id = c.source_id
  ORDER BY cb.rrf_score DESC
  LIMIT p_limit;
$$;

-- ---------------------------------------------------------------------------
-- hybrid_search_boosted
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.hybrid_search_boosted(
  p_org_id           UUID,
  p_query            TEXT,
  p_embedding        VECTOR(1536),
  p_boost_source_ids UUID[] DEFAULT '{}',
  p_boost_factor     FLOAT DEFAULT 1.5,
  p_limit            INTEGER DEFAULT 10,
  p_user_id          UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID, source_id UUID, chunk_index INTEGER, chunk_text TEXT,
  source_title TEXT, source_type TEXT, rank REAL
)
LANGUAGE sql STABLE
SET pg_trgm.word_similarity_threshold = 0.4
AS $$
  WITH fts AS (
    SELECT c.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank_cd(
               to_tsvector('german', c.chunk_text),
               to_or_tsquery('german', p_query)
             ) DESC
           ) AS rank_pos
    FROM public.content_chunks c
    JOIN public.sources s ON s.id = c.source_id
    WHERE c.organization_id = p_org_id
      AND to_tsvector('german', c.chunk_text) @@ to_or_tsquery('german', p_query)
      AND (
        p_user_id IS NULL
        OR s.folder_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.source_folder_access sfa
          JOIN public.permission_group_members pgm ON pgm.group_id = sfa.group_id
          WHERE sfa.folder_id = s.folder_id AND pgm.user_id = p_user_id
        )
      )
    LIMIT 30
  ),
  vec AS (
    SELECT c.id,
           ROW_NUMBER() OVER (ORDER BY c.embedding <=> p_embedding) AS rank_pos
    FROM public.content_chunks c
    JOIN public.sources s ON s.id = c.source_id
    WHERE c.organization_id = p_org_id
      AND c.embedding IS NOT NULL
      AND (
        p_user_id IS NULL
        OR s.folder_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.source_folder_access sfa
          JOIN public.permission_group_members pgm ON pgm.group_id = sfa.group_id
          WHERE sfa.folder_id = s.folder_id AND pgm.user_id = p_user_id
        )
      )
    ORDER BY c.embedding <=> p_embedding
    LIMIT 30
  ),
  trgm AS (
    SELECT c.id,
           ROW_NUMBER() OVER (ORDER BY word_similarity(p_query, c.chunk_text) DESC) AS rank_pos
    FROM public.content_chunks c
    JOIN public.sources s ON s.id = c.source_id
    WHERE c.organization_id = p_org_id
      AND p_query <% c.chunk_text
      AND (
        p_user_id IS NULL
        OR s.folder_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.source_folder_access sfa
          JOIN public.permission_group_members pgm ON pgm.group_id = sfa.group_id
          WHERE sfa.folder_id = s.folder_id AND pgm.user_id = p_user_id
        )
      )
    ORDER BY word_similarity(p_query, c.chunk_text) DESC
    LIMIT 30
  ),
  combined AS (
    SELECT chunk_id, SUM(score)::REAL AS rrf_score
    FROM (
      SELECT id AS chunk_id, 1.0 / (60.0 + rank_pos) AS score FROM fts
      UNION ALL
      SELECT id,             1.0 / (60.0 + rank_pos)            FROM vec
      UNION ALL
      SELECT id,             1.0 / (60.0 + rank_pos)            FROM trgm
    ) u
    GROUP BY chunk_id
  )
  SELECT c.id, c.source_id, c.chunk_index, c.chunk_text,
         s.title AS source_title, s.source_type,
         (cb.rrf_score * CASE
           WHEN c.source_id = ANY(p_boost_source_ids) THEN p_boost_factor
           ELSE 1.0
         END)::REAL AS rank
  FROM combined cb
  JOIN public.content_chunks c ON c.id = cb.chunk_id
  JOIN public.sources s ON s.id = c.source_id
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

-- ---------------------------------------------------------------------------
-- search_chunks — FTS-only fallback with trigram OR-branch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_chunks(
  p_org_id  UUID,
  p_query   TEXT,
  p_limit   INTEGER DEFAULT 10,
  p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID, source_id UUID, chunk_index INTEGER, chunk_text TEXT,
  source_title TEXT, source_type TEXT, rank REAL
)
LANGUAGE sql STABLE
SET pg_trgm.word_similarity_threshold = 0.4
AS $$
  WITH fts AS (
    SELECT c.id,
           ts_rank_cd(
             to_tsvector('german', c.chunk_text),
             to_or_tsquery('german', p_query)
           ) AS fts_rank
    FROM public.content_chunks c
    JOIN public.sources s ON s.id = c.source_id
    WHERE c.organization_id = p_org_id
      AND to_tsvector('german', c.chunk_text) @@ to_or_tsquery('german', p_query)
      AND (
        p_user_id IS NULL
        OR s.folder_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.source_folder_access sfa
          JOIN public.permission_group_members pgm ON pgm.group_id = sfa.group_id
          WHERE sfa.folder_id = s.folder_id AND pgm.user_id = p_user_id
        )
      )
  ),
  trgm AS (
    SELECT c.id,
           word_similarity(p_query, c.chunk_text) AS trgm_rank
    FROM public.content_chunks c
    JOIN public.sources s ON s.id = c.source_id
    WHERE c.organization_id = p_org_id
      AND p_query <% c.chunk_text
      AND (
        p_user_id IS NULL
        OR s.folder_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.source_folder_access sfa
          JOIN public.permission_group_members pgm ON pgm.group_id = sfa.group_id
          WHERE sfa.folder_id = s.folder_id AND pgm.user_id = p_user_id
        )
      )
  ),
  merged AS (
    SELECT id, MAX(r) AS rank
    FROM (
      SELECT id, fts_rank AS r FROM fts
      UNION ALL
      SELECT id, trgm_rank        FROM trgm
    ) u
    GROUP BY id
  )
  SELECT c.id, c.source_id, c.chunk_index, c.chunk_text,
         s.title, s.source_type,
         m.rank::REAL
  FROM merged m
  JOIN public.content_chunks c ON c.id = m.id
  JOIN public.sources s ON s.id = c.source_id
  ORDER BY m.rank DESC
  LIMIT p_limit;
$$;
