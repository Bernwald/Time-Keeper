-- Migration: throttle_pipeline_crons
--
-- Recovery + prevention after the IO budget exhaustion incident on
-- 2026-05-06. Three high-frequency workers (every 30s) plus two connector
-- crons (every 5min) on a Micro instance, combined with the new
-- embed -> extract queue cascade, exhausted the burst credits and locked
-- out auth.
--
-- Changes:
--   1. Worker crons (normalize, embed, extract-entities): 30s -> 2min.
--   2. Connector crons (sharepoint, gdrive): 5min -> 15min.
--   3. New `pgmq_queue_length` RPC so workers can early-exit when the
--      queue is empty (the dominant case at steady state).
--
-- A single-runner advisory lock would be the next layer of defense against
-- pile-up, but PostgREST opens a fresh connection per request so a session
-- advisory lock acquired in one supabase-js call is not held by the next.
-- The right place to add it is inside a future "drain-batch" RPC that owns
-- the lock + the work in one transaction. Out of scope for this migration.
--
-- The cron unschedule blocks are wrapped in DO/EXCEPTION so the migration
-- is safe to apply repeatedly.

-- ─── 1. Drop old high-frequency schedules ─────────────────────────────────

DO $$ BEGIN PERFORM cron.unschedule('worker-normalize-30s');         EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('worker-embed-30s');             EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('worker-extract-entities-30s');  EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('connector-sharepoint-delta');   EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('connector-gdrive-delta');       EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- Drop the new names too in case this migration ran partially before.
DO $$ BEGIN PERFORM cron.unschedule('worker-normalize-2min');        EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('worker-embed-2min');            EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('worker-extract-entities-2min'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ─── 2. Re-schedule at safer cadence ──────────────────────────────────────

SELECT cron.schedule(
  'worker-normalize-2min',
  '*/2 * * * *',
  $$SELECT public.invoke_edge_function('worker-normalize', '{}'::jsonb);$$
);

SELECT cron.schedule(
  'worker-embed-2min',
  '*/2 * * * *',
  $$SELECT public.invoke_edge_function('worker-embed', '{}'::jsonb);$$
);

SELECT cron.schedule(
  'worker-extract-entities-2min',
  '*/2 * * * *',
  $$SELECT public.invoke_edge_function('worker-extract-entities', '{}'::jsonb);$$
);

SELECT cron.schedule(
  'connector-sharepoint-delta',
  '*/15 * * * *',
  $cron$ SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url') || '/functions/v1/connector-sharepoint',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.anon_key')
    ),
    body    := jsonb_build_object('action','delta-sync','trigger','cron')
  ); $cron$
);

SELECT cron.schedule(
  'connector-gdrive-delta',
  '*/15 * * * *',
  $cron$ SELECT net.http_post(
    url     := current_setting('app.settings.supabase_url') || '/functions/v1/connector-gdrive',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.anon_key')
    ),
    body    := jsonb_build_object('action','delta-sync','trigger','cron')
  ); $cron$
);

-- ─── 3. Conditional-polling helper: queue length ──────────────────────────

CREATE OR REPLACE FUNCTION public.pgmq_queue_length(p_queue TEXT)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $$
DECLARE v_length BIGINT;
BEGIN
  -- pgmq.metrics returns: queue_name, queue_length, newest_msg_age_sec,
  -- oldest_msg_age_sec, total_messages, scrape_time. queue_length excludes
  -- archived rows and includes invisible (in-flight) messages.
  SELECT queue_length INTO v_length FROM pgmq.metrics(p_queue);
  RETURN COALESCE(v_length, 0);
EXCEPTION WHEN OTHERS THEN
  -- Queue does not exist or pgmq.metrics signature changed: degrade to a
  -- safe default that lets the worker proceed (i.e. don't block work just
  -- because the metrics call failed).
  RETURN 1;
END;
$$;

REVOKE ALL  ON FUNCTION public.pgmq_queue_length(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pgmq_queue_length(TEXT) TO service_role;
