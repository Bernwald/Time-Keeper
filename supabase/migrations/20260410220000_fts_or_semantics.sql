-- FTS OR-semantics for hybrid search
--
-- websearch_to_tsquery uses AND, which fails for natural language questions
-- like "wie viele Lizenzen gab es bei EnforceTac 2025" because words like
-- "gab" aren't in the data. Switching to OR means chunks matching ANY
-- stemmed keyword are returned; RRF ranking ensures the best matches win.

-- Helper: convert a text query into an OR-based tsquery using the German
-- dictionary for stemming / stop word removal.
CREATE OR REPLACE FUNCTION public.to_or_tsquery(config regconfig, query text)
RETURNS tsquery
LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(
    string_agg(match[1], ' | ')::tsquery,
    websearch_to_tsquery(config, query)  -- fallback if regex finds nothing
  )
  FROM regexp_matches(
    to_tsvector(config, query)::text,
    '''([^'']+)''',
    'g'
  ) AS match;
$$;

-- Update hybrid_search_chunks to use OR-based FTS
CREATE OR REPLACE FUNCTION public.hybrid_search_chunks(
  p_org_id    UUID,
  p_query     TEXT,
  p_embedding VECTOR(1536),
  p_limit     INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID, source_id UUID, chunk_index INTEGER, chunk_text TEXT,
  source_title TEXT, source_type TEXT, rank REAL
)
LANGUAGE sql STABLE AS $$
  WITH fts AS (
    SELECT c.id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank(
               to_tsvector('german', c.chunk_text),
               to_or_tsquery('german', p_query)
             ) DESC
           ) AS rank_pos
    FROM public.content_chunks c
    WHERE c.organization_id = p_org_id
      AND to_tsvector('german', c.chunk_text) @@ to_or_tsquery('german', p_query)
    LIMIT 30
  ),
  vec AS (
    SELECT c.id,
           ROW_NUMBER() OVER (ORDER BY c.embedding <=> p_embedding) AS rank_pos
    FROM public.content_chunks c
    WHERE c.organization_id = p_org_id
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> p_embedding
    LIMIT 30
  ),
  combined AS (
    SELECT
      COALESCE(f.id, v.id) AS chunk_id,
      (COALESCE(1.0 / (60.0 + f.rank_pos), 0) +
       COALESCE(1.0 / (60.0 + v.rank_pos), 0))::REAL AS rrf_score
    FROM fts f
    FULL OUTER JOIN vec v ON f.id = v.id
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

-- Update hybrid_search_boosted to use OR-based FTS
CREATE OR REPLACE FUNCTION public.hybrid_search_boosted(
  p_org_id           UUID,
  p_query            TEXT,
  p_embedding        VECTOR(1536),
  p_boost_source_ids UUID[] DEFAULT '{}',
  p_boost_factor     FLOAT DEFAULT 1.5,
  p_limit            INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID, source_id UUID, chunk_index INTEGER, chunk_text TEXT,
  source_title TEXT, source_type TEXT, rank REAL
)
LANGUAGE sql STABLE AS $$
  WITH fts AS (
    SELECT c.id, c.source_id,
           ROW_NUMBER() OVER (
             ORDER BY ts_rank(
               to_tsvector('german', c.chunk_text),
               to_or_tsquery('german', p_query)
             ) DESC
           ) AS rank_pos
    FROM public.content_chunks c
    WHERE c.organization_id = p_org_id
      AND to_tsvector('german', c.chunk_text) @@ to_or_tsquery('german', p_query)
    LIMIT 30
  ),
  vec AS (
    SELECT c.id, c.source_id,
           ROW_NUMBER() OVER (ORDER BY c.embedding <=> p_embedding) AS rank_pos
    FROM public.content_chunks c
    WHERE c.organization_id = p_org_id
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> p_embedding
    LIMIT 30
  ),
  combined AS (
    SELECT
      COALESCE(f.id, v.id) AS chunk_id,
      COALESCE(f.source_id, v.source_id) AS src_id,
      (COALESCE(1.0 / (60.0 + f.rank_pos), 0) +
       COALESCE(1.0 / (60.0 + v.rank_pos), 0))::REAL AS rrf_score
    FROM fts f
    FULL OUTER JOIN vec v ON f.id = v.id
  )
  SELECT c.id, c.source_id, c.chunk_index, c.chunk_text,
         s.title AS source_title, s.source_type,
         (cb.rrf_score * CASE
           WHEN cb.src_id = ANY(p_boost_source_ids) THEN p_boost_factor
           ELSE 1.0
         END)::REAL AS rank
  FROM combined cb
  JOIN public.content_chunks c ON c.id = cb.chunk_id
  JOIN public.sources s ON s.id = c.source_id
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

-- Update search_chunks (pure FTS fallback) to use OR as well
CREATE OR REPLACE FUNCTION public.search_chunks(
  p_org_id UUID,
  p_query  TEXT,
  p_limit  INTEGER DEFAULT 10
)
RETURNS TABLE (
  id UUID, source_id UUID, chunk_index INTEGER, chunk_text TEXT,
  source_title TEXT, source_type TEXT, rank REAL
)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.source_id, c.chunk_index, c.chunk_text,
         s.title, s.source_type,
         ts_rank(to_tsvector('german', c.chunk_text), to_or_tsquery('german', p_query)) AS rank
  FROM public.content_chunks c
  JOIN public.sources s ON s.id = c.source_id
  WHERE c.organization_id = p_org_id
    AND to_tsvector('german', c.chunk_text) @@ to_or_tsquery('german', p_query)
  ORDER BY rank DESC
  LIMIT p_limit;
$$;
