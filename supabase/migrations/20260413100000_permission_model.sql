-- Migration: permission_model
-- Adds folder-based document permission model for granular access control
-- within an organization. Supports pilot rollouts (additive, non-breaking).
--
-- Core concept:
-- - Sources without folder_id → visible to all org members (backwards-compatible)
-- - Sources with folder_id → visible only to users in a group with folder access
-- - Permission check reused by all search RPCs + RLS policies

-- ─── PERMISSION GROUPS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permission_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  external_id     TEXT,          -- ID from external system (SharePoint Group ID, GDrive group, etc.)
  provider_id     TEXT,          -- 'sharepoint' | 'gdrive' | 'custom' | NULL for manual
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.permission_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read permission_groups"
  ON public.permission_groups FOR SELECT
  USING (is_member_of_org(organization_id));

CREATE POLICY "org members write permission_groups"
  ON public.permission_groups FOR ALL
  USING (is_member_of_org(organization_id));

CREATE TRIGGER set_updated_at_permission_groups
  BEFORE UPDATE ON public.permission_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── PERMISSION GROUP MEMBERS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permission_group_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES public.permission_groups(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_user_id TEXT,         -- mapping to external system user ID
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

ALTER TABLE public.permission_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read permission_group_members"
  ON public.permission_group_members FOR SELECT
  USING (is_member_of_org(organization_id));

CREATE POLICY "org members write permission_group_members"
  ON public.permission_group_members FOR ALL
  USING (is_member_of_org(organization_id));

-- ─── SOURCE FOLDERS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.source_folders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  external_path   TEXT,          -- e.g. SharePoint folder path or GDrive folder ID
  provider_id     TEXT,          -- 'sharepoint' | 'gdrive' | NULL for manual
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.source_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read source_folders"
  ON public.source_folders FOR SELECT
  USING (is_member_of_org(organization_id));

CREATE POLICY "org members write source_folders"
  ON public.source_folders FOR ALL
  USING (is_member_of_org(organization_id));

CREATE TRIGGER set_updated_at_source_folders
  BEFORE UPDATE ON public.source_folders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── SOURCE FOLDER ACCESS ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.source_folder_access (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id       UUID NOT NULL REFERENCES public.source_folders(id) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES public.permission_groups(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (folder_id, group_id)
);

ALTER TABLE public.source_folder_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read source_folder_access"
  ON public.source_folder_access FOR SELECT
  USING (is_member_of_org(organization_id));

CREATE POLICY "org members write source_folder_access"
  ON public.source_folder_access FOR ALL
  USING (is_member_of_org(organization_id));

-- ─── EXTEND SOURCES WITH folder_id ──────────────────────────────────────

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES public.source_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sources_folder_id
  ON public.sources (folder_id) WHERE folder_id IS NOT NULL;

-- ─── EXTEND CONTACTS WITH user_id (for phone assistant caller → user mapping) ─

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ─── CENTRAL PERMISSION CHECK FUNCTION ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.user_can_access_source(
  p_source_id UUID,
  p_user_id   UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sources s
    WHERE s.id = p_source_id
    AND s.deleted_at IS NULL
    AND (
      s.folder_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.source_folder_access sfa
        JOIN public.permission_group_members pgm ON pgm.group_id = sfa.group_id
        WHERE sfa.folder_id = s.folder_id
        AND pgm.user_id = p_user_id
      )
    )
  );
$$;

-- ─── INDEXES FOR PERMISSION JOINS ───────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_source_folder_access_folder_id
  ON public.source_folder_access (folder_id);

CREATE INDEX IF NOT EXISTS idx_source_folder_access_group_id
  ON public.source_folder_access (group_id);

CREATE INDEX IF NOT EXISTS idx_permission_group_members_user_id
  ON public.permission_group_members (user_id);

CREATE INDEX IF NOT EXISTS idx_permission_group_members_group_id
  ON public.permission_group_members (group_id);

-- ─── FOLDER-AWARE RLS ON SOURCES ────────────────────────────────────────
-- Replace the broad FOR ALL policy with separate write + folder-aware read.
-- This ensures the Quellen-UI (direct table queries) also respects folders.

-- Drop old permissive policies that include SELECT
DROP POLICY IF EXISTS "sources_org_all" ON public.sources;
DROP POLICY IF EXISTS "sources_org_read_visible" ON public.sources;

-- Write policies (INSERT/UPDATE/DELETE) — unchanged, org-member check only
CREATE POLICY "sources_org_insert" ON public.sources
  FOR INSERT WITH CHECK (public.is_member_of_org(organization_id));

CREATE POLICY "sources_org_update" ON public.sources
  FOR UPDATE USING (public.is_member_of_org(organization_id));

CREATE POLICY "sources_org_delete" ON public.sources
  FOR DELETE USING (public.is_member_of_org(organization_id));

-- Read policy — folder-aware: sources without folder_id visible to all members,
-- sources with folder_id only visible to members in an authorized group.
CREATE POLICY "sources_org_read_with_folders" ON public.sources
  FOR SELECT USING (
    public.is_member_of_org(organization_id)
    AND deleted_at IS NULL
    AND (
      folder_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.source_folder_access sfa
        JOIN public.permission_group_members pgm ON pgm.group_id = sfa.group_id
        WHERE sfa.folder_id = sources.folder_id
        AND pgm.user_id = auth.uid()
      )
    )
  );

-- ─── UPDATE SEARCH RPCS WITH PERMISSION FILTER ─────────────────────────
-- All search functions gain an optional p_user_id parameter.
-- When NULL → no permission filtering (backwards-compatible for service-role).
-- When set → only returns chunks from sources the user can access.

-- Helper CTE used by all search functions
-- (inlined as SQL doesn't support reusable CTEs across functions)

-- Pure FTS search with permission filter
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
LANGUAGE sql STABLE AS $$
  SELECT c.id, c.source_id, c.chunk_index, c.chunk_text,
         s.title, s.source_type,
         ts_rank_cd(to_tsvector('german', c.chunk_text), to_or_tsquery('german', p_query)) AS rank
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
  ORDER BY rank DESC
  LIMIT p_limit;
$$;

-- Pure vector similarity search with permission filter
CREATE OR REPLACE FUNCTION public.match_chunks(
  p_org_id    UUID,
  p_embedding VECTOR(1536),
  p_limit     INTEGER DEFAULT 10,
  p_threshold FLOAT DEFAULT 0.5,
  p_user_id   UUID DEFAULT NULL
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
  LIMIT p_limit;
$$;

-- Hybrid search (RRF) with permission filter
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
LANGUAGE sql STABLE AS $$
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

-- Boosted hybrid search with permission filter
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
LANGUAGE sql STABLE AS $$
  WITH fts AS (
    SELECT c.id, c.source_id,
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
    SELECT c.id, c.source_id,
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
