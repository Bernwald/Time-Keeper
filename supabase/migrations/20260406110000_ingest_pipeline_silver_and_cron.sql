-- Migration: ingest_pipeline_silver_and_cron
-- Adds the Silver layer (typed entity tables), monthly raw_events partition
-- rollover, and pg_cron schedules for the ingest pipeline.

-- ─── SILVER: NORMALIZED CALENDAR EVENTS ─────────────────────────────────
-- First normalized entity table. Pattern repeats per provider/domain:
--   * (organization_id, provider_id, external_id) is the natural key
--   * payload_hash tracks which raw_events row produced this version
--   * raw JSONB stays for fields we have not mapped yet

CREATE TABLE IF NOT EXISTS public.entities_calendar_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_id     TEXT NOT NULL,
  external_id     TEXT NOT NULL,
  payload_hash    TEXT NOT NULL,
  summary         TEXT,
  description     TEXT,
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  location        TEXT,
  organizer_email TEXT,
  attendees       JSONB NOT NULL DEFAULT '[]',
  raw             JSONB NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_entities_calendar_events_org_starts
  ON public.entities_calendar_events (organization_id, starts_at DESC);

ALTER TABLE public.entities_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entities_calendar_events_read" ON public.entities_calendar_events;
CREATE POLICY "entities_calendar_events_read" ON public.entities_calendar_events
  FOR SELECT USING (public.is_member_of_org(organization_id));

-- ─── KPI VIEW (admin dashboard) ─────────────────────────────────────────

CREATE OR REPLACE VIEW public.integration_kpi_daily AS
SELECT
  organization_id,
  provider_id,
  date_trunc('day', started_at)              AS day,
  COUNT(*)                                   AS run_count,
  COUNT(*) FILTER (WHERE status = 'success') AS success_count,
  COUNT(*) FILTER (WHERE status = 'failed')  AS failed_count,
  COALESCE(SUM(records_in),     0)           AS records_in_total,
  COALESCE(SUM(records_ok),     0)           AS records_ok_total,
  COALESCE(SUM(records_failed), 0)           AS records_failed_total,
  COALESCE(AVG(duration_ms),    0)::INT      AS avg_duration_ms
FROM public.integration_runs
GROUP BY organization_id, provider_id, date_trunc('day', started_at);

GRANT SELECT ON public.integration_kpi_daily TO authenticated, service_role;

-- ─── PARTITION ROLLOVER ─────────────────────────────────────────────────
-- Ensures raw_events always has a partition for the current month and the
-- next two months. Idempotent — safe to run repeatedly.

CREATE OR REPLACE FUNCTION public.ensure_raw_events_partitions()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_month DATE;
  v_next  DATE;
  v_name  TEXT;
BEGIN
  FOR i IN 0..2 LOOP
    v_month := (date_trunc('month', NOW()) + (i || ' month')::INTERVAL)::DATE;
    v_next  := (date_trunc('month', NOW()) + ((i + 1) || ' month')::INTERVAL)::DATE;
    v_name  := format('raw_events_%s', to_char(v_month, 'YYYYMM'));
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.raw_events FOR VALUES FROM (%L) TO (%L)',
      v_name, v_month, v_next
    );
  END LOOP;
END;
$$;

-- ─── PG_CRON SCHEDULES ──────────────────────────────────────────────────
-- pg_cron is enabled by default on Supabase. We schedule three jobs:
--   1. ensure_raw_events_partitions — daily at 02:00 UTC
--   2. invoke sync-google-calendar  — every 15 minutes for active orgs
--   3. invoke worker-normalize      — every 30 seconds (drains queue)

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Helper: project URL + service key live in vault. Adjust the secret names
-- if your Supabase project uses different ones.
CREATE OR REPLACE FUNCTION public.invoke_edge_function(
  p_name TEXT,
  p_body JSONB DEFAULT '{}'::JSONB
)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_url  TEXT;
  v_key  TEXT;
  v_id   BIGINT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'invoke_edge_function: vault secrets project_url / service_role_key missing — skipping';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := v_url || '/functions/v1/' || p_name,
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := p_body
  ) INTO v_id;
  RETURN v_id;
END;
$$;

-- 1. partition rollover — daily
SELECT cron.schedule(
  'ingest-partition-rollover',
  '0 2 * * *',
  $$SELECT public.ensure_raw_events_partitions();$$
);

-- 2. google calendar sync — every 15 minutes for every active integration
SELECT cron.schedule(
  'sync-google-calendar-15min',
  '*/15 * * * *',
  $$
  SELECT public.invoke_edge_function(
    'sync-google-calendar',
    jsonb_build_object('organization_id', ci.organization_id, 'trigger', 'cron')
  )
  FROM public.calendar_integrations ci
  WHERE ci.status = 'active';
  $$
);

-- 3. normalize worker — every 30 seconds
SELECT cron.schedule(
  'worker-normalize-30s',
  '30 seconds',
  $$SELECT public.invoke_edge_function('worker-normalize', '{}'::jsonb);$$
);
