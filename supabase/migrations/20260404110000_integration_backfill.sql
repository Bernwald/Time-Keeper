-- Migration: integration_backfill
-- Populates organization_integrations from existing phone_assistants and calendar_integrations.
-- Backfills organizations.plan_id from metadata->>'plan'.

-- ─── BACKFILL: organizations.plan_id from metadata ──────────────────────

UPDATE public.organizations
SET plan_id = CASE
  WHEN metadata->>'plan' = 'enterprise' THEN 'enterprise'
  WHEN metadata->>'plan' = 'premium'    THEN 'premium'
  WHEN metadata->>'plan' = 'basic'      THEN 'basic'
  ELSE 'standard'
END
WHERE plan_id IS NULL OR plan_id = 'standard';

-- ─── BACKFILL: VAPI integrations from phone_assistants ──────────────────

INSERT INTO public.organization_integrations (
  organization_id, provider_id, status, credential_mode, config
)
SELECT
  pa.organization_id,
  'vapi',
  CASE
    WHEN pa.status = 'active' AND pa.provider_assistant_id IS NOT NULL THEN 'active'
    WHEN pa.provider_assistant_id IS NOT NULL THEN 'configuring'
    ELSE 'pending'
  END,
  'platform',
  jsonb_build_object(
    'provider_assistant_id', pa.provider_assistant_id
  )
FROM public.phone_assistants pa
ON CONFLICT (organization_id, provider_id) DO NOTHING;

-- ─── BACKFILL: Google Calendar integrations ─────────────────────────────

INSERT INTO public.organization_integrations (
  organization_id, provider_id, status, credential_mode, config
)
SELECT
  ci.organization_id,
  'google_calendar',
  CASE WHEN ci.status = 'active' THEN 'active' ELSE 'pending' END,
  'platform',
  jsonb_build_object(
    'calendar_id', ci.calendar_id
  )
FROM public.calendar_integrations ci
ON CONFLICT (organization_id, provider_id) DO NOTHING;
