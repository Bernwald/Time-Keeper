-- Trash & reconciliation support for connector sources.
--
-- Adds:
--   * list_deleted_sources(p_org_id)  – returns soft-deleted rows for the
--     trash UI (RLS hides them from normal selects)
--   * restore_source(p_source_id)     – clears deleted_at, requeues for
--     re-embed via the existing pipeline
--   * purge_source(p_source_id)       – hard-delete a soft-deleted row
--     and its chunks (point of no return)
--   * reconcile_drive_sources(p_org_id, p_provider, p_existing_ids text[])
--     – soft-delete every connector source whose external_id is NOT in
--     the supplied snapshot. Used by the daily reconcile cron and the
--     manual "Aufräumen" button.

-- ─── list_deleted_sources ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_deleted_sources(p_org_id UUID)
RETURNS TABLE (
  id              UUID,
  title           TEXT,
  source_type     TEXT,
  connector_type  TEXT,
  source_url      TEXT,
  deleted_at      TIMESTAMPTZ,
  word_count      INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_member_of_org(p_org_id) THEN
    RAISE EXCEPTION 'not a member of org %', p_org_id;
  END IF;
  RETURN QUERY
    SELECT s.id, s.title, s.source_type, s.connector_type,
           s.source_url, s.deleted_at, s.word_count
      FROM public.sources s
     WHERE s.organization_id = p_org_id
       AND s.deleted_at IS NOT NULL
     ORDER BY s.deleted_at DESC;
END; $$;

-- ─── restore_source ───────────────────────────────────────────────────
-- Clears deleted_at and flips sync_status to 'queued' so the next
-- delta-sync (or a manual retry) will re-pull the file. Chunks stay
-- soft-deleted; embed worker recreates them on the next embed pass.
CREATE OR REPLACE FUNCTION public.restore_source(p_source_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  SELECT organization_id INTO v_org FROM public.sources WHERE id = p_source_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'source % not found', p_source_id; END IF;
  IF NOT public.is_member_of_org(v_org) THEN
    RAISE EXCEPTION 'not a member of org %', v_org;
  END IF;
  UPDATE public.sources
     SET deleted_at = NULL, sync_status = 'queued'
   WHERE id = p_source_id;
END; $$;

-- ─── purge_source ─────────────────────────────────────────────────────
-- Hard-delete: row + chunks vanish forever. Only allowed if already
-- soft-deleted, so the user always passes through the trash first.
CREATE OR REPLACE FUNCTION public.purge_source(p_source_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID; v_deleted TIMESTAMPTZ;
BEGIN
  SELECT organization_id, deleted_at INTO v_org, v_deleted
    FROM public.sources WHERE id = p_source_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'source % not found', p_source_id; END IF;
  IF NOT public.is_member_of_org(v_org) THEN
    RAISE EXCEPTION 'not a member of org %', v_org;
  END IF;
  IF v_deleted IS NULL THEN
    RAISE EXCEPTION 'source % must be in trash before purge', p_source_id;
  END IF;
  DELETE FROM public.content_chunks WHERE source_id = p_source_id;
  DELETE FROM public.sources WHERE id = p_source_id;
END; $$;

-- ─── reconcile_drive_sources ──────────────────────────────────────────
-- Soft-delete every active connector source whose external_id is NOT in
-- the supplied snapshot of currently visible Drive/SharePoint file IDs.
-- Returns the number of rows that were just removed so the caller can
-- surface a "X verwaiste Dateien entfernt" toast.
CREATE OR REPLACE FUNCTION public.reconcile_drive_sources(
  p_org_id        UUID,
  p_connector     TEXT,
  p_existing_ids  TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER;
BEGIN
  WITH stale AS (
    SELECT id FROM public.sources
     WHERE organization_id = p_org_id
       AND connector_type = p_connector
       AND deleted_at IS NULL
       AND NOT (external_id = ANY(p_existing_ids))
  ), upd_src AS (
    UPDATE public.sources
       SET deleted_at = NOW(), sync_status = 'idle'
     WHERE id IN (SELECT id FROM stale)
    RETURNING id
  ), upd_chunks AS (
    UPDATE public.content_chunks
       SET deleted_at = NOW()
     WHERE source_id IN (SELECT id FROM upd_src)
       AND deleted_at IS NULL
    RETURNING source_id
  )
  SELECT COUNT(*) INTO v_count FROM upd_src;
  RETURN COALESCE(v_count, 0);
END; $$;

GRANT EXECUTE ON FUNCTION public.list_deleted_sources(UUID)              TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_source(UUID)                    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_source(UUID)                      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_drive_sources(UUID, TEXT, TEXT[]) TO service_role;

-- ─── Daily reconcile cron ─────────────────────────────────────────────
-- 24h drift is fine for the first customer. Frequency can be tightened
-- per-tenant later by deleting this job and scheduling a per-org one.
SELECT cron.unschedule('reconcile-connectors-daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='reconcile-connectors-daily');

SELECT cron.schedule(
  'reconcile-connectors-daily',
  '17 3 * * *',  -- 03:17 UTC every day, off-peak
  $$SELECT public.invoke_edge_function('connector-gdrive', '{"action":"reconcile"}'::jsonb);$$
);
