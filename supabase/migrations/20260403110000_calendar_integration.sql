-- Migration: calendar_integration
-- Google Calendar integration for phone assistant appointment scheduling

-- ─── TABLE ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar_integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'google' CHECK (provider IN ('google')),
  calendar_id     TEXT NOT NULL DEFAULT 'primary',
  refresh_token   TEXT,
  access_token    TEXT,
  token_expires_at TIMESTAMPTZ,
  settings        JSONB NOT NULL DEFAULT '{
    "default_duration_minutes": 30,
    "buffer_minutes": 15,
    "working_hours_start": "09:00",
    "working_hours_end": "17:00",
    "timezone": "Europe/Berlin"
  }',
  status          TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active','inactive')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_calendar_org UNIQUE (organization_id)
);

-- ─── INDEXES ───────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_calendar_integrations_org
  ON calendar_integrations(organization_id);

-- ─── TRIGGER ───────────────────────────────────────────────────────────────

CREATE TRIGGER set_calendar_integrations_updated_at
  BEFORE UPDATE ON calendar_integrations
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE calendar_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read calendar_integrations" ON calendar_integrations;
CREATE POLICY "org members read calendar_integrations" ON calendar_integrations
  FOR SELECT USING (is_member_of_org(organization_id));

DROP POLICY IF EXISTS "org members write calendar_integrations" ON calendar_integrations;
CREATE POLICY "org members write calendar_integrations" ON calendar_integrations
  FOR ALL USING (is_member_of_org(organization_id));

-- ─── LOOKUP FUNCTION (for Edge Functions, bypasses RLS) ────────────────────

CREATE OR REPLACE FUNCTION get_calendar_integration_for_org(p_org_id UUID)
RETURNS TABLE (
  calendar_id TEXT,
  refresh_token TEXT,
  access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  settings JSONB,
  status TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    ci.calendar_id,
    ci.refresh_token,
    ci.access_token,
    ci.token_expires_at,
    ci.settings,
    ci.status
  FROM calendar_integrations ci
  WHERE ci.organization_id = p_org_id
    AND ci.status = 'active'
  LIMIT 1;
$$;

-- Update stored access token (called from Edge Function after refresh)
CREATE OR REPLACE FUNCTION update_calendar_token(
  p_org_id UUID,
  p_access_token TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
AS $$
  UPDATE calendar_integrations
  SET access_token = p_access_token,
      token_expires_at = p_expires_at
  WHERE organization_id = p_org_id;
$$;
