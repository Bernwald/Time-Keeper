-- Migration: activities
-- Universal activity log for consulting interactions (notes, meetings, calls, decisions)

-- ─── ACTIVITIES TABLE ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.activities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_type    TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_minutes INTEGER,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata         JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.activity_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  activity_id     UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  linked_type     TEXT NOT NULL,
  linked_id       UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, linked_type, linked_id)
);

-- ─── INDEXES ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_activities_org ON public.activities (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON public.activities (organization_id, activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_links_activity ON public.activity_links (activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_links_entity ON public.activity_links (linked_type, linked_id);

-- ─── TRIGGERS ───────────────────────────────────────────────────────────

CREATE TRIGGER set_updated_at_activities
  BEFORE UPDATE ON public.activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activities_org_all" ON public.activities
  FOR ALL USING (public.is_member_of_org(organization_id))
  WITH CHECK (public.is_member_of_org(organization_id));

CREATE POLICY "activity_links_org_all" ON public.activity_links
  FOR ALL USING (public.is_member_of_org(organization_id))
  WITH CHECK (public.is_member_of_org(organization_id));

-- ─── HELPER FUNCTIONS ───────────────────────────────────────────────────

-- Get activities for a specific entity
CREATE OR REPLACE FUNCTION public.get_activities_for_entity(
  p_linked_type TEXT,
  p_linked_id   UUID,
  p_limit       INTEGER DEFAULT 50
)
RETURNS TABLE (
  id UUID, activity_type TEXT, title TEXT, description TEXT,
  occurred_at TIMESTAMPTZ, duration_minutes INTEGER,
  created_by UUID, created_by_name TEXT,
  metadata JSONB, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT a.id, a.activity_type, a.title, a.description,
         a.occurred_at, a.duration_minutes,
         a.created_by,
         COALESCE(p.full_name, 'Unbekannt') AS created_by_name,
         a.metadata, a.created_at
  FROM public.activity_links al
  JOIN public.activities a ON a.id = al.activity_id
  LEFT JOIN public.profiles p ON p.id = a.created_by
  WHERE al.linked_type = p_linked_type
    AND al.linked_id = p_linked_id
  ORDER BY a.occurred_at DESC
  LIMIT p_limit;
$$;

-- Get all linked entities for an activity
CREATE OR REPLACE FUNCTION public.get_activity_links_resolved(p_activity_id UUID)
RETURNS TABLE (
  id UUID, linked_type TEXT, linked_id UUID, linked_name TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT al.id, al.linked_type, al.linked_id,
         CASE al.linked_type
           WHEN 'company' THEN (SELECT name FROM public.companies WHERE id = al.linked_id)
           WHEN 'contact' THEN (SELECT first_name || ' ' || last_name FROM public.contacts WHERE id = al.linked_id)
           WHEN 'project' THEN (SELECT name FROM public.projects WHERE id = al.linked_id)
           ELSE 'Unbekannt'
         END AS linked_name,
         al.created_at
  FROM public.activity_links al
  WHERE al.activity_id = p_activity_id;
$$;

-- FTS index for activity search
CREATE INDEX IF NOT EXISTS idx_activities_fts ON public.activities USING GIN(
  to_tsvector('german', COALESCE(title,'') || ' ' || COALESCE(description,''))
);

-- ─── FEATURE FLAG ───────────────────────────────────────────────────────

INSERT INTO public.feature_flags (key, name, description, is_core) VALUES
  ('activities', 'Aktivitaeten', 'Universelle Timeline aller Interaktionen', TRUE)
ON CONFLICT (key) DO NOTHING;
