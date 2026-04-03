-- Migration: plan_tiers_and_integration_registry
-- Adds plan tier system, integration provider registry, and enhanced onboarding.

-- ─── PLAN TIERS ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_tiers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  limits        JSONB NOT NULL DEFAULT '{}',
  instance_type TEXT NOT NULL DEFAULT 'shared' CHECK (instance_type IN ('shared', 'dedicated')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.plan_tier_features (
  plan_id     TEXT NOT NULL REFERENCES public.plan_tiers(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL REFERENCES public.feature_flags(key) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, feature_key)
);

-- Add plan_id to organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES public.plan_tiers(id) DEFAULT 'standard';

-- RLS
ALTER TABLE public.plan_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_tier_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_tiers_read" ON public.plan_tiers;
CREATE POLICY "plan_tiers_read" ON public.plan_tiers FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "plan_tier_features_read" ON public.plan_tier_features;
CREATE POLICY "plan_tier_features_read" ON public.plan_tier_features FOR SELECT USING (TRUE);

-- ─── SEED: PLAN TIERS ───────────────────────────────────────────────────

INSERT INTO public.plan_tiers (id, name, description, limits, instance_type, sort_order) VALUES
  ('basic',      'Basic',      'Grundfunktionen fuer kleine Teams',
    '{"max_sources": 50, "max_members": 3, "max_phone_numbers": 0}',
    'shared', 10),
  ('standard',   'Standard',   'Erweiterte Funktionen mit API-Zugang',
    '{"max_sources": 500, "max_members": 10, "max_phone_numbers": 0}',
    'shared', 20),
  ('premium',    'Premium',    'Alle Funktionen inkl. Telefonassistent',
    '{"max_sources": 5000, "max_members": 50, "max_phone_numbers": 3}',
    'shared', 30),
  ('enterprise', 'Enterprise', 'Dedizierte Instanz, keine Limits',
    '{"max_sources": null, "max_members": null, "max_phone_numbers": null}',
    'dedicated', 40)
ON CONFLICT (id) DO NOTHING;

-- ─── SEED: PLAN ↔ FEATURE MAPPINGS ─────────────────────────────────────

-- Basic: core features only (sources, search, chat, companies, contacts, projects)
INSERT INTO public.plan_tier_features (plan_id, feature_key) VALUES
  ('basic', 'sources'),
  ('basic', 'search'),
  ('basic', 'chat'),
  ('basic', 'companies'),
  ('basic', 'contacts'),
  ('basic', 'projects')
ON CONFLICT DO NOTHING;

-- Standard: basic + csv_import + api_access
INSERT INTO public.plan_tier_features (plan_id, feature_key) VALUES
  ('standard', 'sources'),
  ('standard', 'search'),
  ('standard', 'chat'),
  ('standard', 'companies'),
  ('standard', 'contacts'),
  ('standard', 'projects'),
  ('standard', 'csv_import'),
  ('standard', 'api_access')
ON CONFLICT DO NOTHING;

-- Premium: standard + phone_assistant + custom_branding
INSERT INTO public.plan_tier_features (plan_id, feature_key) VALUES
  ('premium', 'sources'),
  ('premium', 'search'),
  ('premium', 'chat'),
  ('premium', 'companies'),
  ('premium', 'contacts'),
  ('premium', 'projects'),
  ('premium', 'csv_import'),
  ('premium', 'api_access'),
  ('premium', 'phone_assistant'),
  ('premium', 'custom_branding')
ON CONFLICT DO NOTHING;

-- Enterprise: all features
INSERT INTO public.plan_tier_features (plan_id, feature_key) VALUES
  ('enterprise', 'sources'),
  ('enterprise', 'search'),
  ('enterprise', 'chat'),
  ('enterprise', 'companies'),
  ('enterprise', 'contacts'),
  ('enterprise', 'projects'),
  ('enterprise', 'csv_import'),
  ('enterprise', 'api_access'),
  ('enterprise', 'phone_assistant'),
  ('enterprise', 'custom_branding')
ON CONFLICT DO NOTHING;

-- ─── INTEGRATION PROVIDERS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.integration_providers (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('voice', 'calendar', 'crm', 'ai', 'storage', 'messaging')),
  auth_type     TEXT NOT NULL CHECK (auth_type IN ('api_key', 'oauth2', 'webhook')),
  config_schema JSONB NOT NULL DEFAULT '{}',
  feature_key   TEXT REFERENCES public.feature_flags(key),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.organization_integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_id     TEXT NOT NULL REFERENCES public.integration_providers(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'configuring', 'active', 'error', 'disabled')),
  credential_mode TEXT NOT NULL DEFAULT 'platform'
                    CHECK (credential_mode IN ('platform', 'customer')),
  credentials     JSONB NOT NULL DEFAULT '{}',
  config          JSONB NOT NULL DEFAULT '{}',
  error_message   TEXT,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_org_integrations_org ON public.organization_integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_integrations_provider ON public.organization_integrations(provider_id);

-- Triggers
DROP TRIGGER IF EXISTS set_updated_at_org_integrations ON public.organization_integrations;
CREATE TRIGGER set_updated_at_org_integrations
  BEFORE UPDATE ON public.organization_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.integration_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integration_providers_read" ON public.integration_providers;
CREATE POLICY "integration_providers_read" ON public.integration_providers
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "org_integrations_read" ON public.organization_integrations;
CREATE POLICY "org_integrations_read" ON public.organization_integrations
  FOR SELECT USING (public.is_member_of_org(organization_id));

DROP POLICY IF EXISTS "org_integrations_write" ON public.organization_integrations;
CREATE POLICY "org_integrations_write" ON public.organization_integrations
  FOR ALL USING (public.is_member_of_org(organization_id))
  WITH CHECK (public.is_member_of_org(organization_id));

-- ─── SEED: PROVIDERS ────────────────────────────────────────────────────

INSERT INTO public.integration_providers (id, name, category, auth_type, feature_key) VALUES
  ('vapi',            'Vapi',            'voice',    'api_key',  'phone_assistant'),
  ('google_calendar', 'Google Calendar', 'calendar', 'oauth2',   NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── UPDATED FUNCTIONS ──────────────────────────────────────────────────

-- org_has_feature: now checks plan_tier_features as fallback
CREATE OR REPLACE FUNCTION public.org_has_feature(
  p_org_id UUID,
  p_feature_key TEXT
)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT CASE
    -- 1. Explicit override in organization_features
    WHEN EXISTS (
      SELECT 1 FROM public.organization_features
      WHERE organization_id = p_org_id AND feature_key = p_feature_key
    ) THEN (
      SELECT enabled FROM public.organization_features
      WHERE organization_id = p_org_id AND feature_key = p_feature_key
    )
    -- 2. Check plan_tier_features for the org's plan
    WHEN EXISTS (
      SELECT 1
      FROM public.organizations o
      JOIN public.plan_tier_features ptf ON ptf.plan_id = o.plan_id
      WHERE o.id = p_org_id AND ptf.feature_key = p_feature_key
    ) THEN TRUE
    -- 3. Fallback: is_core
    ELSE (
      SELECT COALESCE(is_core, FALSE) FROM public.feature_flags
      WHERE key = p_feature_key
    )
  END;
$$;

-- get_org_features: now includes plan-based defaults
CREATE OR REPLACE FUNCTION public.get_org_features(p_org_id UUID)
RETURNS TABLE (feature_key TEXT, name TEXT, description TEXT, enabled BOOLEAN, config JSONB)
LANGUAGE sql STABLE AS $$
  SELECT
    ff.key AS feature_key,
    ff.name,
    ff.description,
    CASE
      WHEN of.feature_key IS NOT NULL THEN of.enabled
      WHEN ptf.feature_key IS NOT NULL THEN TRUE
      ELSE ff.is_core
    END AS enabled,
    COALESCE(of.config, '{}') AS config
  FROM public.feature_flags ff
  LEFT JOIN public.organization_features of
    ON of.feature_key = ff.key AND of.organization_id = p_org_id
  LEFT JOIN public.organizations o ON o.id = p_org_id
  LEFT JOIN public.plan_tier_features ptf
    ON ptf.feature_key = ff.key AND ptf.plan_id = o.plan_id;
$$;

-- Get a specific limit for an org's plan
CREATE OR REPLACE FUNCTION public.get_org_limit(
  p_org_id UUID,
  p_limit_key TEXT
)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT (pt.limits->>p_limit_key)::INTEGER
  FROM public.organizations o
  JOIN public.plan_tiers pt ON pt.id = o.plan_id
  WHERE o.id = p_org_id;
$$;

-- Get integration config for an org + provider
CREATE OR REPLACE FUNCTION public.get_org_integration(
  p_org_id UUID,
  p_provider_id TEXT
)
RETURNS TABLE (
  status TEXT,
  credential_mode TEXT,
  credentials JSONB,
  config JSONB,
  error_message TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    oi.status,
    oi.credential_mode,
    oi.credentials,
    oi.config,
    oi.error_message
  FROM public.organization_integrations oi
  WHERE oi.organization_id = p_org_id
    AND oi.provider_id = p_provider_id
  LIMIT 1;
$$;

-- ─── ONBOARD V2 ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.onboard_organization_v2(
  p_user_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_plan_id TEXT DEFAULT 'standard'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID;
  v_plan plan_tiers%ROWTYPE;
BEGIN
  -- Validate plan
  SELECT * INTO v_plan FROM public.plan_tiers WHERE id = p_plan_id AND is_active = TRUE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan "%" nicht gefunden oder inaktiv', p_plan_id;
  END IF;

  -- Create organization
  INSERT INTO public.organizations (slug, name, status, plan_id, metadata)
  VALUES (
    p_org_slug,
    p_org_name,
    'active',
    p_plan_id,
    jsonb_build_object(
      'branding', jsonb_build_object(
        'display_name', p_org_name,
        'short_name', LEFT(p_org_name, 2)
      ),
      'instance_type', v_plan.instance_type
    )
  )
  RETURNING id INTO v_org_id;

  -- Add user as owner
  INSERT INTO public.organization_members (organization_id, user_id, role, is_default)
  VALUES (v_org_id, p_user_id, 'owner', TRUE);

  -- Create organization_features for all non-core plan features
  INSERT INTO public.organization_features (organization_id, feature_key, enabled)
  SELECT v_org_id, ptf.feature_key, TRUE
  FROM public.plan_tier_features ptf
  JOIN public.feature_flags ff ON ff.key = ptf.feature_key
  WHERE ptf.plan_id = p_plan_id
    AND ff.is_core = FALSE;

  -- Create pending integration entries for qualified providers
  INSERT INTO public.organization_integrations (organization_id, provider_id, status, credential_mode)
  SELECT v_org_id, ip.id, 'pending', 'platform'
  FROM public.integration_providers ip
  WHERE ip.is_active = TRUE
    AND (
      ip.feature_key IS NULL
      OR public.org_has_feature(v_org_id, ip.feature_key)
    );

  RETURN v_org_id;
END;
$$;
