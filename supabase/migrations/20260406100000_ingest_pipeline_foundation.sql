-- Migration: ingest_pipeline_foundation
-- Establishes the queue-based ingest pipeline foundation:
--   * pgmq extension for transactional job queues
--   * raw_events  (Bronze layer) – immutable JSONB dump of every API response
--   * integration_runs           – per-sync observability
--   * job_failures               – dead-letter queue with replay support
--
-- All tenant-scoped tables use the standard is_member_of_org() RLS pattern.

-- ─── EXTENSIONS ─────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgmq CASCADE;

-- Create the four pipeline queues. pgmq.create is idempotent.
SELECT pgmq.create('ingest');
SELECT pgmq.create('normalize');
SELECT pgmq.create('embed');
SELECT pgmq.create('index');

-- ─── BRONZE: RAW EVENTS ─────────────────────────────────────────────────
-- Immutable, append-only landing zone for every payload pulled from a
-- customer API. Re-processing happens from here, never from a re-fetch.
-- Partitioned by month to keep indexes small and enable cheap pruning.

CREATE TABLE IF NOT EXISTS public.raw_events (
  id              BIGSERIAL,
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_id     TEXT        NOT NULL REFERENCES public.integration_providers(id) ON DELETE RESTRICT,
  run_id          UUID,
  external_id     TEXT        NOT NULL,
  entity_type     TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  payload_hash    TEXT        NOT NULL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id, fetched_at)
) PARTITION BY RANGE (fetched_at);

-- Initial partition: current month + next month so writes never fail at
-- month boundary. A pg_cron job (added in a later migration) will roll
-- partitions forward.
DO $$
DECLARE
  v_start DATE := date_trunc('month', NOW())::DATE;
  v_next  DATE := (date_trunc('month', NOW()) + INTERVAL '1 month')::DATE;
  v_after DATE := (date_trunc('month', NOW()) + INTERVAL '2 month')::DATE;
BEGIN
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.raw_events_%s PARTITION OF public.raw_events FOR VALUES FROM (%L) TO (%L)',
    to_char(v_start, 'YYYYMM'), v_start, v_next
  );
  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS public.raw_events_%s PARTITION OF public.raw_events FOR VALUES FROM (%L) TO (%L)',
    to_char(v_next, 'YYYYMM'), v_next, v_after
  );
END $$;

CREATE INDEX IF NOT EXISTS idx_raw_events_org_provider
  ON public.raw_events (organization_id, provider_id, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_raw_events_external
  ON public.raw_events (organization_id, provider_id, entity_type, external_id);

-- Idempotency: same payload hash for same external entity = no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_events_idempotent
  ON public.raw_events (organization_id, provider_id, external_id, payload_hash, fetched_at);

ALTER TABLE public.raw_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "raw_events_read" ON public.raw_events;
CREATE POLICY "raw_events_read" ON public.raw_events
  FOR SELECT USING (public.is_member_of_org(organization_id));

-- Writes only via service role (workers). No client-side write policy.

-- ─── OBSERVABILITY: INTEGRATION RUNS ────────────────────────────────────
-- One row per sync invocation. Powers the admin KPI dashboard and the
-- "is the data flow healthy?" view that decides whether the agency
-- delivers value or not.

CREATE TABLE IF NOT EXISTS public.integration_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_id     TEXT NOT NULL REFERENCES public.integration_providers(id) ON DELETE RESTRICT,
  trigger         TEXT NOT NULL CHECK (trigger IN ('manual', 'cron', 'webhook', 'replay')),
  status          TEXT NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'success', 'partial', 'failed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  duration_ms     INT,
  records_in      INT NOT NULL DEFAULT 0,
  records_ok      INT NOT NULL DEFAULT 0,
  records_failed  INT NOT NULL DEFAULT 0,
  error_message   TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_integration_runs_org_started
  ON public.integration_runs (organization_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_runs_provider_status
  ON public.integration_runs (provider_id, status, started_at DESC);

ALTER TABLE public.integration_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "integration_runs_read" ON public.integration_runs;
CREATE POLICY "integration_runs_read" ON public.integration_runs
  FOR SELECT USING (public.is_member_of_org(organization_id));

-- ─── DEAD-LETTER: JOB FAILURES ──────────────────────────────────────────
-- Whenever a worker exhausts its retries, the job lands here. Admin UI
-- offers a one-click replay that re-enqueues into the originating queue.

CREATE TABLE IF NOT EXISTS public.job_failures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_id     TEXT REFERENCES public.integration_providers(id) ON DELETE SET NULL,
  run_id          UUID REFERENCES public.integration_runs(id) ON DELETE SET NULL,
  queue_name      TEXT NOT NULL,
  message         JSONB NOT NULL,
  error_message   TEXT NOT NULL,
  error_stack     TEXT,
  attempt_count   INT NOT NULL DEFAULT 1,
  failed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replayed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_job_failures_org_failed
  ON public.job_failures (organization_id, failed_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_failures_unreplayed
  ON public.job_failures (failed_at DESC) WHERE replayed_at IS NULL;

ALTER TABLE public.job_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "job_failures_read" ON public.job_failures;
CREATE POLICY "job_failures_read" ON public.job_failures
  FOR SELECT USING (public.is_member_of_org(organization_id));

-- ─── HELPER FUNCTIONS ───────────────────────────────────────────────────

-- Start a new run, return its id. Workers call this at sync entry.
CREATE OR REPLACE FUNCTION public.start_integration_run(
  p_org_id      UUID,
  p_provider_id TEXT,
  p_trigger     TEXT DEFAULT 'cron'
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run_id UUID;
BEGIN
  INSERT INTO public.integration_runs (organization_id, provider_id, trigger)
  VALUES (p_org_id, p_provider_id, p_trigger)
  RETURNING id INTO v_run_id;
  RETURN v_run_id;
END;
$$;

-- Finish a run with totals.
CREATE OR REPLACE FUNCTION public.finish_integration_run(
  p_run_id        UUID,
  p_status        TEXT,
  p_records_in    INT,
  p_records_ok    INT,
  p_records_failed INT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.integration_runs
  SET status         = p_status,
      finished_at    = NOW(),
      duration_ms    = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
      records_in     = p_records_in,
      records_ok     = p_records_ok,
      records_failed = p_records_failed,
      error_message  = p_error_message
  WHERE id = p_run_id;
END;
$$;

-- Replay a dead-lettered job back into its origin queue.
CREATE OR REPLACE FUNCTION public.replay_job_failure(p_failure_id UUID)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_failure public.job_failures%ROWTYPE;
  v_msg_id  BIGINT;
BEGIN
  SELECT * INTO v_failure FROM public.job_failures WHERE id = p_failure_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'job_failure % not found', p_failure_id;
  END IF;

  SELECT pgmq.send(v_failure.queue_name, v_failure.message) INTO v_msg_id;

  UPDATE public.job_failures
  SET replayed_at = NOW()
  WHERE id = p_failure_id;

  RETURN v_msg_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_integration_run(UUID, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finish_integration_run(UUID, TEXT, INT, INT, INT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.replay_job_failure(UUID) TO authenticated, service_role;

-- ─── RATE LIMIT BUCKETS ─────────────────────────────────────────────────
-- Token bucket state shared across all worker invocations. One row per
-- (organization_id, provider_id). No RLS reads from clients – workers only.

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_id     TEXT        NOT NULL,
  tokens          DOUBLE PRECISION NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (organization_id, provider_id)
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
-- No policies = no client access. Only service role (workers) can touch it.

-- ─── PGMQ WRAPPERS (public schema, callable via PostgREST RPC) ──────────
-- Supabase exposes functions in `public` over the API. We wrap pgmq's
-- internal functions so Edge Functions can call them through supabase-js
-- without needing direct pgmq schema access.

CREATE OR REPLACE FUNCTION public.pgmq_send(queue_name TEXT, msg JSONB)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $$
DECLARE v_id BIGINT;
BEGIN
  SELECT pgmq.send(queue_name, msg) INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_read(queue_name TEXT, vt INT, qty INT)
RETURNS SETOF pgmq.message_record LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $$
BEGIN
  RETURN QUERY SELECT * FROM pgmq.read(queue_name, vt, qty);
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_delete(queue_name TEXT, msg_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  SELECT pgmq.delete(queue_name, msg_id) INTO v_ok;
  RETURN v_ok;
END;
$$;

CREATE OR REPLACE FUNCTION public.pgmq_archive(queue_name TEXT, msg_id BIGINT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  SELECT pgmq.archive(queue_name, msg_id) INTO v_ok;
  RETURN v_ok;
END;
$$;

REVOKE ALL ON FUNCTION public.pgmq_send(TEXT, JSONB)        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pgmq_read(TEXT, INT, INT)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pgmq_delete(TEXT, BIGINT)     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pgmq_archive(TEXT, BIGINT)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pgmq_send(TEXT, JSONB)     TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_read(TEXT, INT, INT)  TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_delete(TEXT, BIGINT)  TO service_role;
GRANT EXECUTE ON FUNCTION public.pgmq_archive(TEXT, BIGINT) TO service_role;
