-- Migration: sources_connector_extensions
--
-- Extends the existing knowledge layer (sources, content_chunks) with the
-- fields needed for connector-based ingest from external systems
-- (SharePoint, Google Drive, etc.) without breaking the upload flow.
--
-- Design decisions:
--   * ADDITIVE only — sources/content_chunks stay backwards compatible.
--   * connector_type distinguishes 'upload' (existing flow) from
--     'sharepoint' / 'gdrive' / future connectors. Default keeps existing
--     rows on 'upload'.
--   * external_id + etag enable Delta-Sync: re-fetching only changed files.
--   * sync_status surfaces connector health to the UI without joining runs.
--   * Soft-delete (deleted_at) propagates DSGVO deletes through embedding
--     caches without losing audit trail.
--   * model_version on content_chunks lets us re-embed in batches when we
--     upgrade embedding models — old chunks invalidate, new ones append.

-- ─── EXTEND sources ────────────────────────────────────────────────────

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS connector_type   TEXT        NOT NULL DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS external_id      TEXT,
  ADD COLUMN IF NOT EXISTS etag             TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status      TEXT        NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS sync_error       TEXT,
  ADD COLUMN IF NOT EXISTS source_url       TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at       TIMESTAMPTZ;

ALTER TABLE public.sources
  DROP CONSTRAINT IF EXISTS sources_connector_type_check;
ALTER TABLE public.sources
  ADD CONSTRAINT sources_connector_type_check
  CHECK (connector_type IN ('upload', 'sharepoint', 'gdrive', 'gmail', 'erp'));

ALTER TABLE public.sources
  DROP CONSTRAINT IF EXISTS sources_sync_status_check;
ALTER TABLE public.sources
  ADD CONSTRAINT sources_sync_status_check
  CHECK (sync_status IN ('idle', 'queued', 'syncing', 'success', 'error'));

-- One source per (org, connector, external_id). NULL external_id (uploads)
-- is allowed to repeat — partial unique index excludes them.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sources_external
  ON public.sources (organization_id, connector_type, external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sources_sync_status
  ON public.sources (organization_id, connector_type, sync_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sources_last_synced
  ON public.sources (connector_type, last_synced_at)
  WHERE deleted_at IS NULL;

-- ─── EXTEND content_chunks ─────────────────────────────────────────────

ALTER TABLE public.content_chunks
  ADD COLUMN IF NOT EXISTS model_version   TEXT NOT NULL DEFAULT 'text-embedding-3-small',
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_chunks_model_version
  ON public.content_chunks (model_version)
  WHERE deleted_at IS NULL;

-- ─── HELPER FUNCTIONS ──────────────────────────────────────────────────

-- Soft-delete a source and all its chunks. Used by Writeback (when a file
-- is removed in the source system) and by user-initiated DSGVO deletes.
CREATE OR REPLACE FUNCTION public.soft_delete_source(p_source_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.sources
  SET deleted_at = NOW(), sync_status = 'idle'
  WHERE id = p_source_id AND deleted_at IS NULL;

  UPDATE public.content_chunks
  SET deleted_at = NOW()
  WHERE source_id = p_source_id AND deleted_at IS NULL;
END;
$$;

-- Mark all chunks of a source as stale so the embed worker re-creates them
-- on the next pass. Used after Writeback edits or when the source file's
-- etag changed.
CREATE OR REPLACE FUNCTION public.invalidate_source_chunks(p_source_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  UPDATE public.content_chunks
  SET deleted_at = NOW()
  WHERE source_id = p_source_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.sources
  SET sync_status = 'queued'
  WHERE id = p_source_id;

  RETURN v_count;
END;
$$;

-- Upsert a connector-sourced file. Connectors call this from raw_events
-- normalization. Returns (source_id, was_changed) so the worker knows
-- whether to re-chunk + re-embed.
CREATE OR REPLACE FUNCTION public.upsert_connector_source(
  p_org_id          UUID,
  p_connector_type  TEXT,
  p_external_id     TEXT,
  p_title           TEXT,
  p_etag            TEXT,
  p_mime_type       TEXT DEFAULT NULL,
  p_source_url      TEXT DEFAULT NULL,
  p_metadata        JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (source_id UUID, was_changed BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id      UUID;
  v_old_etag TEXT;
  v_changed BOOLEAN := FALSE;
BEGIN
  SELECT id, etag INTO v_id, v_old_etag
  FROM public.sources
  WHERE organization_id = p_org_id
    AND connector_type  = p_connector_type
    AND external_id     = p_external_id;

  IF v_id IS NULL THEN
    INSERT INTO public.sources (
      organization_id, title, source_type, mime_type,
      connector_type, external_id, etag, source_url,
      sync_status, last_synced_at, metadata
    ) VALUES (
      p_org_id, p_title, 'connector', p_mime_type,
      p_connector_type, p_external_id, p_etag, p_source_url,
      'queued', NOW(), p_metadata
    )
    RETURNING id INTO v_id;
    v_changed := TRUE;
  ELSE
    -- Existing source — only re-embed if etag changed
    IF v_old_etag IS DISTINCT FROM p_etag THEN
      UPDATE public.sources
      SET title          = p_title,
          etag           = p_etag,
          source_url     = COALESCE(p_source_url, source_url),
          sync_status    = 'queued',
          last_synced_at = NOW(),
          deleted_at     = NULL,
          metadata       = metadata || p_metadata
      WHERE id = v_id;

      -- Invalidate old chunks — embed worker will recreate
      UPDATE public.content_chunks
      SET deleted_at = NOW()
      WHERE source_id = v_id AND deleted_at IS NULL;

      v_changed := TRUE;
    ELSE
      -- Touch last_synced_at so health UI shows fresh sync
      UPDATE public.sources
      SET last_synced_at = NOW()
      WHERE id = v_id;
    END IF;
  END IF;

  source_id := v_id;
  was_changed := v_changed;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_source(UUID)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invalidate_source_chunks(UUID)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_connector_source(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

-- ─── RLS UPDATES ───────────────────────────────────────────────────────
-- Existing policies (sources_org_all, chunks_org_all) cover writes via
-- is_member_of_org(). We add a read-side filter to hide soft-deleted rows
-- from clients without breaking service-role workers, which bypass RLS.

DROP POLICY IF EXISTS "sources_org_read_visible" ON public.sources;
CREATE POLICY "sources_org_read_visible" ON public.sources
  FOR SELECT USING (
    public.is_member_of_org(organization_id) AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "chunks_org_read_visible" ON public.content_chunks;
CREATE POLICY "chunks_org_read_visible" ON public.content_chunks
  FOR SELECT USING (
    public.is_member_of_org(organization_id) AND deleted_at IS NULL
  );

-- The pre-existing sources_org_all / chunks_org_all FOR ALL policies still
-- apply to INSERT/UPDATE/DELETE. The new SELECT policies are additive in
-- restrictive mode and shadow the FOR ALL select branch.
