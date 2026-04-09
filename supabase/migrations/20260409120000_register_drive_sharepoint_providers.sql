-- Migration: register_drive_sharepoint_providers
--
-- Registers SharePoint and Google Drive as integration providers so the
-- per-org credential registry + ingest pipeline can route their syncs.
-- Also schedules pg_cron delta-sync jobs every 5 minutes for active orgs.

INSERT INTO public.integration_providers (id, name, category, auth_type, feature_key) VALUES
  ('sharepoint',   'Microsoft SharePoint', 'storage', 'oauth2', NULL),
  ('google_drive', 'Google Drive',         'storage', 'oauth2', NULL)
ON CONFLICT (id) DO NOTHING;

-- ─── CRON: delta-sync every 5 minutes for active orgs ───────────────────
-- Mirrors the worker-embed-cron pattern. The connector edge functions
-- pull all active org_integrations themselves, so we just trigger them.

DO $$
DECLARE
  v_anon_key TEXT;
  v_url      TEXT;
BEGIN
  -- Use the same secret resolution pattern as existing cron jobs.
  v_anon_key := COALESCE(
    current_setting('app.settings.anon_key', true),
    ''
  );
  v_url := COALESCE(
    current_setting('app.settings.supabase_url', true),
    ''
  );
  -- Skip cron registration if settings are not present (local dev).
  IF v_anon_key = '' OR v_url = '' THEN
    RAISE NOTICE 'Skipping connector cron — anon_key/url not in settings';
    RETURN;
  END IF;
END $$;

-- pg_cron jobs are managed centrally; we use a simple INSERT-IF-MISSING.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'connector-sharepoint-delta') THEN
    PERFORM cron.schedule(
      'connector-sharepoint-delta',
      '*/5 * * * *',
      $cron$ SELECT net.http_post(
         url     := current_setting('app.settings.supabase_url') || '/functions/v1/connector-sharepoint',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'Authorization', 'Bearer ' || current_setting('app.settings.anon_key')
         ),
         body    := jsonb_build_object('action','delta-sync','trigger','cron')
       ); $cron$
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'connector-gdrive-delta') THEN
    PERFORM cron.schedule(
      'connector-gdrive-delta',
      '*/5 * * * *',
      $cron$ SELECT net.http_post(
         url     := current_setting('app.settings.supabase_url') || '/functions/v1/connector-gdrive',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'Authorization', 'Bearer ' || current_setting('app.settings.anon_key')
         ),
         body    := jsonb_build_object('action','delta-sync','trigger','cron')
       ); $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'connector cron schedule skipped: %', SQLERRM;
END $$;
