-- Migration: tags_system
-- Universal tagging for all entities (companies, contacts, projects, sources, activities)

-- ─── TAGS TABLE ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  color           TEXT,
  category        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.entity_tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tag_id          UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tag_id, entity_type, entity_id)
);

-- ─── INDEXES ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_tags_org ON public.tags (organization_id, name);
CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON public.entity_tags (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON public.entity_tags (tag_id);

-- ─── RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags_org_all" ON public.tags
  FOR ALL USING (public.is_member_of_org(organization_id))
  WITH CHECK (public.is_member_of_org(organization_id));

CREATE POLICY "entity_tags_org_all" ON public.entity_tags
  FOR ALL USING (public.is_member_of_org(organization_id))
  WITH CHECK (public.is_member_of_org(organization_id));

-- ─── HELPER FUNCTIONS ───────────────────────────────────────────────────

-- Get all tags for an entity
CREATE OR REPLACE FUNCTION public.get_tags_for_entity(
  p_entity_type TEXT,
  p_entity_id   UUID
)
RETURNS TABLE (
  id UUID, name TEXT, color TEXT, category TEXT
)
LANGUAGE sql STABLE AS $$
  SELECT t.id, t.name, t.color, t.category
  FROM public.entity_tags et
  JOIN public.tags t ON t.id = et.tag_id
  WHERE et.entity_type = p_entity_type
    AND et.entity_id = p_entity_id
  ORDER BY t.name;
$$;

-- Get entities by tag
CREATE OR REPLACE FUNCTION public.get_entities_by_tag(
  p_org_id      UUID,
  p_tag_id      UUID,
  p_entity_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  entity_type TEXT, entity_id UUID, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT et.entity_type, et.entity_id, et.created_at
  FROM public.entity_tags et
  WHERE et.organization_id = p_org_id
    AND et.tag_id = p_tag_id
    AND (p_entity_type IS NULL OR et.entity_type = p_entity_type)
  ORDER BY et.created_at DESC;
$$;

-- ─── FEATURE FLAG ───────────────────────────────────────────────────────

INSERT INTO public.feature_flags (key, name, description, is_core) VALUES
  ('tags', 'Tags', 'Flexible Kategorisierung aller Entitaeten', TRUE)
ON CONFLICT (key) DO NOTHING;
