-- Migration: async_crons_and_sync_lock
--
-- Two fixes for the IO budget exhaustion incident on 2026-05-06:
--
-- 1. Worker crons (normalize, embed, extract-entities) used the synchronous
--    `invoke_edge_function` wrapper, which holds a Postgres connection until
--    the Edge Function returns (20-65s). With three crons firing every 2min,
--    the connection pool stayed saturated and statement_timeouts piled up.
--    Switch to async `net.http_post` (same pattern as the connector crons),
--    so the cron call returns in milliseconds.
--
-- 2. Add a per-(org, provider) sync lock on `organization_integrations` so
--    the manual "Jetzt synchronisieren" button cannot trigger overlapping
--    runs. Stale locks (>30 min) auto-expire so a crashed run cannot deadlock.

-- ─── 1. Re-schedule worker crons asynchronously ───────────────────────────

DO $$ BEGIN PERFORM cron.unschedule('worker-normalize-2min');        EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('worker-embed-2min');            EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('worker-extract-entities-2min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'worker-normalize-2min',
  '*/2 * * * *',
  $cron$ SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url') || '/functions/v1/worker-normalize',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.anon_key')
    ),
    body    := '{}'::jsonb
  ); $cron$
);

SELECT cron.schedule(
  'worker-embed-2min',
  '*/2 * * * *',
  $cron$ SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url') || '/functions/v1/worker-embed',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.anon_key')
    ),
    body    := '{}'::jsonb
  ); $cron$
);

SELECT cron.schedule(
  'worker-extract-entities-2min',
  '*/2 * * * *',
  $cron$ SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url') || '/functions/v1/worker-extract-entities',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.anon_key')
    ),
    body    := '{}'::jsonb
  ); $cron$
);

-- ─── 2. Sync lock on organization_integrations ───────────────────────────

ALTER TABLE public.organization_integrations
  ADD COLUMN IF NOT EXISTS sync_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_locked_by TEXT;

-- Atomic test-and-set. Returns TRUE if the lock was acquired, FALSE if a
-- concurrent run already holds it. A lock older than 30 minutes is treated
-- as stale (the previous run probably crashed) and gets force-acquired so
-- the system cannot deadlock.
CREATE OR REPLACE FUNCTION public.try_acquire_sync_lock(
  p_org_id      UUID,
  p_provider_id TEXT,
  p_owner       TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_acquired BOOLEAN;
BEGIN
  UPDATE organization_integrations
     SET sync_locked_at = NOW(),
         sync_locked_by = p_owner
   WHERE organization_id = p_org_id
     AND provider_id     = p_provider_id
     AND (sync_locked_at IS NULL OR sync_locked_at < NOW() - INTERVAL '30 minutes')
   RETURNING TRUE INTO v_acquired;
  RETURN COALESCE(v_acquired, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_sync_lock(
  p_org_id      UUID,
  p_provider_id TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE organization_integrations
     SET sync_locked_at = NULL,
         sync_locked_by = NULL
   WHERE organization_id = p_org_id
     AND provider_id     = p_provider_id;
END;
$$;

REVOKE ALL  ON FUNCTION public.try_acquire_sync_lock(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL  ON FUNCTION public.release_sync_lock(UUID, TEXT)           FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.try_acquire_sync_lock(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_sync_lock(UUID, TEXT)           TO service_role;
