-- Fix ambiguous column reference exposed by the force-retry branch:
-- `source_id` is both an OUT parameter and a column on content_chunks.

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
  v_id         UUID;
  v_old_etag   TEXT;
  v_old_status TEXT;
  v_changed    BOOLEAN := FALSE;
  v_force      BOOLEAN := FALSE;
BEGIN
  SELECT s.id, s.etag, s.sync_status INTO v_id, v_old_etag, v_old_status
  FROM public.sources s
  WHERE s.organization_id = p_org_id
    AND s.connector_type  = p_connector_type
    AND s.external_id     = p_external_id;

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
    UPDATE public.sources s
       SET deleted_at = NULL
     WHERE s.id = v_id AND s.deleted_at IS NOT NULL;

    v_force := v_old_status IN ('queued', 'failed', 'error');

    IF v_old_etag IS DISTINCT FROM p_etag OR v_force THEN
      UPDATE public.sources s
      SET title          = p_title,
          etag           = p_etag,
          source_url     = COALESCE(p_source_url, s.source_url),
          sync_status    = 'queued',
          last_synced_at = NOW(),
          deleted_at     = NULL,
          metadata       = s.metadata || p_metadata
      WHERE s.id = v_id;

      UPDATE public.content_chunks c
         SET deleted_at = NOW()
       WHERE c.source_id = v_id AND c.deleted_at IS NULL;

      v_changed := TRUE;
    ELSE
      UPDATE public.sources s
         SET last_synced_at = NOW()
       WHERE s.id = v_id;
    END IF;
  END IF;

  source_id := v_id;
  was_changed := v_changed;
  RETURN NEXT;
END;
$$;
