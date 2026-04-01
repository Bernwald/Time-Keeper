-- Migration: hybrid_search_and_links
-- Adds vector similarity search, hybrid search (RRF), entity-boosted search,
-- and resolved source-link query functions.

-- ─── HNSW INDEX for fast vector search ───────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_chunks_embedding
  ON public.content_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- ─── PURE VECTOR SIMILARITY SEARCH ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.match_chunks(
  p_org_id    UUID,
  p_embedding VECTOR(1536),
  p_limit     INTEGER DEFAULT 10,
  p_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID, source_id UUID, chunk_index INTEGER, chunk_text TEXT,
  source_title TEXT, source_type TEXT, rank REAL
)
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.source_id, c.chunk_index, c.chunk_text,
         s.title AS source_title, s.source_type,
         (1 - (c.embedding <=> p_embedding))::REAL AS rank
  FROM public.content_chunks c
  JOIN public.sources s ON s.id = c.source_id
  WHERE c.organization_id = p_org_id
    AND c.embedding IS NOT NULL
    AND 1 - (c.embedding <=> p_embedding) > p_threshold
  ORDER BY c.embedding <=> p_embedding
  LIMIT p_limit;
$$;

-- ─── HYBRID SEARCH (Reciprocal Rank Fusion) ─────────────────────────────

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
               websearch_to_tsquery('german', p_query)
             ) DESC
           ) AS rank_pos
    FROM public.content_chunks c
    WHERE c.organization_id = p_org_id
      AND to_tsvector('german', c.chunk_text) @@ websearch_to_tsquery('german', p_query)
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

-- ─── BOOSTED HYBRID SEARCH (for entity-linked sources) ──────────────────

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
               websearch_to_tsquery('german', p_query)
             ) DESC
           ) AS rank_pos
    FROM public.content_chunks c
    WHERE c.organization_id = p_org_id
      AND to_tsvector('german', c.chunk_text) @@ websearch_to_tsquery('german', p_query)
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

-- ─── RESOLVED SOURCE LINKS (for source detail page) ─────────────────────

CREATE OR REPLACE FUNCTION public.get_source_links_resolved(p_source_id UUID)
RETURNS TABLE (
  id UUID, source_id UUID, linked_type TEXT, linked_id UUID,
  link_role TEXT, created_at TIMESTAMPTZ, linked_name TEXT
)
LANGUAGE sql STABLE AS $$
  SELECT sl.id, sl.source_id, sl.linked_type, sl.linked_id,
         sl.link_role, sl.created_at,
         CASE sl.linked_type
           WHEN 'company' THEN (SELECT name FROM public.companies WHERE id = sl.linked_id)
           WHEN 'contact' THEN (SELECT first_name || ' ' || last_name FROM public.contacts WHERE id = sl.linked_id)
           WHEN 'project' THEN (SELECT name FROM public.projects WHERE id = sl.linked_id)
           ELSE 'Unbekannt'
         END AS linked_name
  FROM public.source_links sl
  WHERE sl.source_id = p_source_id;
$$;

-- ─── SOURCES FOR ENTITY (for entity detail pages) ───────────────────────

CREATE OR REPLACE FUNCTION public.get_sources_for_entity(
  p_linked_type TEXT,
  p_linked_id   UUID
)
RETURNS TABLE (
  id UUID, source_id UUID, link_role TEXT, created_at TIMESTAMPTZ,
  source_title TEXT, source_type TEXT, source_status TEXT
)
LANGUAGE sql STABLE AS $$
  SELECT sl.id, sl.source_id, sl.link_role, sl.created_at,
         s.title AS source_title, s.source_type, s.status AS source_status
  FROM public.source_links sl
  JOIN public.sources s ON s.id = sl.source_id
  WHERE sl.linked_type = p_linked_type
    AND sl.linked_id = p_linked_id;
$$;
