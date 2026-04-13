-- Fix soft_delete_source: add org membership check and soft-delete chunks.
--
-- Previously the function only set deleted_at on the source row but left
-- content_chunks active, meaning deleted documents remained searchable.
-- Also adds is_member_of_org guard consistent with restore/purge functions.

CREATE OR REPLACE FUNCTION public.soft_delete_source(p_source_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_org UUID;
BEGIN
  SELECT organization_id INTO v_org
    FROM public.sources WHERE id = p_source_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'source % not found', p_source_id;
  END IF;
  IF NOT public.is_member_of_org(v_org) THEN
    RAISE EXCEPTION 'not a member of org %', v_org;
  END IF;

  UPDATE public.sources
     SET deleted_at = NOW(), sync_status = 'idle'
   WHERE id = p_source_id AND deleted_at IS NULL;

  UPDATE public.content_chunks
     SET deleted_at = NOW()
   WHERE source_id = p_source_id AND deleted_at IS NULL;
END; $$;
