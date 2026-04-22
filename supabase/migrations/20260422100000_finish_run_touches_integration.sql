-- Migration: finish_run_touches_integration
--
-- `finish_integration_run` only updated `integration_runs` — the per-org
-- `organization_integrations.last_synced_at` column was never written,
-- so the UI on /quellen reported "noch nie synchronisiert" even after
-- successful runs. Now a non-failed run also touches the integration row
-- so health badges reflect reality.

CREATE OR REPLACE FUNCTION public.finish_integration_run(
  p_run_id        UUID,
  p_status        TEXT,
  p_records_in    INT,
  p_records_ok    INT,
  p_records_failed INT,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id      UUID;
  v_provider_id TEXT;
BEGIN
  UPDATE public.integration_runs
  SET status         = p_status,
      finished_at    = NOW(),
      duration_ms    = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
      records_in     = p_records_in,
      records_ok     = p_records_ok,
      records_failed = p_records_failed,
      error_message  = p_error_message
  WHERE id = p_run_id
  RETURNING organization_id, provider_id
    INTO v_org_id, v_provider_id;

  IF v_org_id IS NOT NULL AND p_status IN ('success', 'partial') THEN
    UPDATE public.organization_integrations
    SET last_synced_at = NOW(),
        error_message  = NULL,
        updated_at     = NOW()
    WHERE organization_id = v_org_id
      AND provider_id     = v_provider_id;
  ELSIF v_org_id IS NOT NULL AND p_status = 'failed' THEN
    UPDATE public.organization_integrations
    SET error_message = p_error_message,
        updated_at    = NOW()
    WHERE organization_id = v_org_id
      AND provider_id     = v_provider_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.finish_integration_run(UUID, TEXT, INT, INT, INT, TEXT) TO service_role;
