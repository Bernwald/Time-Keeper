-- Migration: feature_flags_and_branding
-- Adds feature flag system, platform admin role, and org branding conventions.

-- ─── PLATFORM ADMIN ─────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- ─── FEATURE FLAGS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  is_core     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organization_features (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  feature_key     TEXT NOT NULL REFERENCES public.feature_flags(key) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  config          JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, feature_key)
);

-- RLS
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_read" ON public.feature_flags;
CREATE POLICY "feature_flags_read" ON public.feature_flags
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "org_features_read" ON public.organization_features;
CREATE POLICY "org_features_read" ON public.organization_features
  FOR SELECT USING (public.is_member_of_org(organization_id));

-- Trigger
DROP TRIGGER IF EXISTS set_updated_at_org_features ON public.organization_features;
CREATE TRIGGER set_updated_at_org_features
  BEFORE UPDATE ON public.organization_features
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── FEATURE FLAG FUNCTIONS ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.org_has_feature(
  p_org_id UUID,
  p_feature_key TEXT
)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.organization_features
      WHERE organization_id = p_org_id AND feature_key = p_feature_key
    ) THEN (
      SELECT enabled FROM public.organization_features
      WHERE organization_id = p_org_id AND feature_key = p_feature_key
    )
    ELSE (
      SELECT COALESCE(is_core, FALSE) FROM public.feature_flags
      WHERE key = p_feature_key
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_org_features(p_org_id UUID)
RETURNS TABLE (feature_key TEXT, name TEXT, description TEXT, enabled BOOLEAN, config JSONB)
LANGUAGE sql STABLE AS $$
  SELECT
    ff.key AS feature_key,
    ff.name,
    ff.description,
    COALESCE(of.enabled, ff.is_core) AS enabled,
    COALESCE(of.config, '{}') AS config
  FROM public.feature_flags ff
  LEFT JOIN public.organization_features of
    ON of.feature_key = ff.key AND of.organization_id = p_org_id;
$$;

-- ─── ONBOARDING FUNCTION ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.onboard_organization(
  p_user_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
BEGIN
  INSERT INTO public.organizations (slug, name, status, metadata)
  VALUES (
    p_org_slug,
    p_org_name,
    'active',
    jsonb_build_object(
      'branding', jsonb_build_object(
        'display_name', p_org_name,
        'short_name', LEFT(p_org_name, 2)
      ),
      'instance_type', 'shared',
      'plan', 'standard'
    )
  )
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, is_default)
  VALUES (v_org_id, p_user_id, 'owner', TRUE);

  RETURN v_org_id;
END;
$$;

-- ─── SEED: CORE FEATURES ────────────────────────────────────────────────

INSERT INTO public.feature_flags (key, name, description, is_core) VALUES
  ('sources',         'Quellen',          'Wissensquellen verwalten',       TRUE),
  ('search',          'Suche',            'Hybrid-Suche ueber alle Quellen', TRUE),
  ('chat',            'Chat',             'AI-Chat mit Quellenkontext',      TRUE),
  ('companies',       'Unternehmen',      'Firmenverwaltung',               TRUE),
  ('contacts',        'Kontakte',         'Kontaktverwaltung',              TRUE),
  ('projects',        'Projekte',         'Projektverwaltung',              TRUE),
  ('csv_import',      'CSV-Import',       'Massenimport via CSV/Excel',     TRUE),
  ('api_access',      'API-Zugang',       'REST API Zugang',               FALSE),
  ('custom_branding', 'Eigenes Branding', 'Eigene Farben und Logo',        FALSE)
ON CONFLICT (key) DO NOTHING;

-- ─── SEED: DEFAULT ORG BRANDING ─────────────────────────────────────────

UPDATE public.organizations
SET metadata = jsonb_build_object(
  'branding', jsonb_build_object(
    'display_name', 'Time Keeper',
    'short_name', 'TK',
    'accent_color', '#0d9488',
    'accent_color_hover', '#0f766e'
  ),
  'instance_type', 'shared',
  'plan', 'enterprise'
)
WHERE slug = 'time-keeper';
