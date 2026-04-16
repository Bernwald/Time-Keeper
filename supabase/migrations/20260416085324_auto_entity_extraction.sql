-- Migration: auto_entity_extraction
--
-- Adds a new ingest stage that extracts structured entities (contacts,
-- companies, projects) from any source whose content looks like a list
-- — e.g. "Vertriebskontakte" coming from Drive as a CSV/XLSX. Goal: the
-- customer never has to tag anything manually; the entity_list retrieval
-- path fires automatically once the LLM has classified + extracted the
-- rows.
--
-- Components of this migration:
--   1. pgmq queue `extract`
--   2. provenance columns on contacts/companies/projects
--     (source_id, extracted_at, extraction_model)
--   3. RPC `upsert_contact_from_extraction` — dedupes by email/phone/name,
--      auto-creates company by name, auto-creates + links tags
--   4. RPC `upsert_company_from_extraction` — dedupes by lower(name)
--   5. RPC `upsert_project_from_extraction` — dedupes by lower(name)
--   6. RPC `delete_auto_extracted_by_source` — called on re-ingest to
--      wipe this source's previous auto-extract before rebuilding
--
-- Manually created rows (extracted_at IS NULL) are never touched.

-- ─── QUEUE ────────────────────────────────────────────────────────────

SELECT pgmq.create('extract');

-- ─── PROVENANCE COLUMNS ───────────────────────────────────────────────────

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS source_id        UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS extracted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_model TEXT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS source_id        UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS extracted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_model TEXT;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS source_id        UUID REFERENCES public.sources(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS extracted_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extraction_model TEXT;

-- Fast lookup "all auto-extracted rows for this source"
CREATE INDEX IF NOT EXISTS contacts_source_id_idx  ON public.contacts  (organization_id, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS companies_source_id_idx ON public.companies (organization_id, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS projects_source_id_idx  ON public.projects  (organization_id, source_id) WHERE source_id IS NOT NULL;

-- ─── HELPER: ENSURE TAG + LINK ENTITY ────────────────────────────────────
--
-- Finds or creates a tag by name (case-insensitive) and links it to the
-- given entity. Used by the upsert RPCs for the auto-tagging step, e.g.
-- a "Status: Warm" column value creates a "warm" tag and links it to the
-- contact. Idempotent.

CREATE OR REPLACE FUNCTION public.ensure_entity_tag(
  p_org_id      UUID,
  p_entity_type TEXT,
  p_entity_id   UUID,
  p_tag_name    TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tag_id UUID;
  v_clean  TEXT;
BEGIN
  v_clean := TRIM(p_tag_name);
  IF v_clean = '' THEN RETURN NULL; END IF;

  SELECT id INTO v_tag_id
  FROM public.tags
  WHERE organization_id = p_org_id AND LOWER(name) = LOWER(v_clean)
  LIMIT 1;

  IF v_tag_id IS NULL THEN
    INSERT INTO public.tags (organization_id, name)
    VALUES (p_org_id, v_clean)
    RETURNING id INTO v_tag_id;
  END IF;

  INSERT INTO public.entity_tags (organization_id, tag_id, entity_type, entity_id)
  VALUES (p_org_id, v_tag_id, p_entity_type, p_entity_id)
  ON CONFLICT DO NOTHING;

  RETURN v_tag_id;
END;
$$;

-- ─── UPSERT COMPANY FROM EXTRACTION ──────────────────────────────────────
--
-- Dedupe order: auto-extracted row from same source wins (replace), else
-- matching manual row by lower(name), else new row. We never overwrite a
-- manual row's data — only link the source and attach tags.

CREATE OR REPLACE FUNCTION public.upsert_company_from_extraction(
  p_org_id           UUID,
  p_source_id        UUID,
  p_name             TEXT,
  p_website          TEXT,
  p_status           TEXT,
  p_extraction_model TEXT,
  p_tags             TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id    UUID;
  v_clean TEXT;
  v_tag   TEXT;
BEGIN
  v_clean := TRIM(p_name);
  IF v_clean = '' THEN RETURN NULL; END IF;

  -- Match by name (case-insensitive) within the org
  SELECT id INTO v_id
  FROM public.companies
  WHERE organization_id = p_org_id AND LOWER(name) = LOWER(v_clean)
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.companies (
      organization_id, name, website, status,
      source_id, extracted_at, extraction_model
    )
    VALUES (
      p_org_id, v_clean, NULLIF(p_website,''), COALESCE(NULLIF(p_status,''), 'active'),
      p_source_id, NOW(), p_extraction_model
    )
    RETURNING id INTO v_id;
  ELSE
    -- Existing row: only touch it if it is itself auto-extracted.
    -- Manual rows stay untouched (user wins).
    UPDATE public.companies
    SET website          = COALESCE(NULLIF(p_website,''), website),
        status           = COALESCE(NULLIF(p_status,''), status),
        source_id        = p_source_id,
        extracted_at     = NOW(),
        extraction_model = p_extraction_model,
        updated_at       = NOW()
    WHERE id = v_id
      AND extracted_at IS NOT NULL;
  END IF;

  FOREACH v_tag IN ARRAY p_tags LOOP
    PERFORM public.ensure_entity_tag(p_org_id, 'company', v_id, v_tag);
  END LOOP;

  RETURN v_id;
END;
$$;

-- ─── UPSERT CONTACT FROM EXTRACTION ──────────────────────────────────────
--
-- Dedupe priority:
--   1. email (case-insensitive) — strongest signal
--   2. phone (normalized digits only) — second-best
--   3. (first_name, last_name) combo within same company — fallback
-- When a manual row matches, we only link the source/tags but don't
-- overwrite its data. Company lookup: if p_company_name is given, we
-- reuse upsert_company_from_extraction so the company row gets the same
-- provenance treatment.

CREATE OR REPLACE FUNCTION public.upsert_contact_from_extraction(
  p_org_id           UUID,
  p_source_id        UUID,
  p_first_name       TEXT,
  p_last_name        TEXT,
  p_email            TEXT,
  p_phone            TEXT,
  p_role_title       TEXT,
  p_status           TEXT,
  p_company_name     TEXT,
  p_extraction_model TEXT,
  p_tags             TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id          UUID;
  v_company_id  UUID;
  v_first       TEXT := TRIM(COALESCE(p_first_name, ''));
  v_last        TEXT := TRIM(COALESCE(p_last_name, ''));
  v_email_clean TEXT := LOWER(NULLIF(TRIM(p_email), ''));
  v_phone_digits TEXT := NULLIF(REGEXP_REPLACE(COALESCE(p_phone,''), '[^0-9]', '', 'g'), '');
  v_tag         TEXT;
BEGIN
  IF v_first = '' AND v_last = '' THEN RETURN NULL; END IF;

  IF NULLIF(TRIM(COALESCE(p_company_name,'')), '') IS NOT NULL THEN
    v_company_id := public.upsert_company_from_extraction(
      p_org_id, p_source_id, p_company_name, NULL, NULL, p_extraction_model, ARRAY[]::TEXT[]
    );
  END IF;

  -- 1) match by email
  IF v_email_clean IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.contacts
    WHERE organization_id = p_org_id AND LOWER(email) = v_email_clean
    LIMIT 1;
  END IF;

  -- 2) match by normalized phone
  IF v_id IS NULL AND v_phone_digits IS NOT NULL THEN
    SELECT id INTO v_id
    FROM public.contacts
    WHERE organization_id = p_org_id
      AND REGEXP_REPLACE(COALESCE(phone,''), '[^0-9]', '', 'g') = v_phone_digits
    LIMIT 1;
  END IF;

  -- 3) match by (first_name, last_name) within same company
  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.contacts
    WHERE organization_id = p_org_id
      AND LOWER(first_name) = LOWER(v_first)
      AND LOWER(last_name)  = LOWER(v_last)
      AND (v_company_id IS NULL OR company_id IS NOT DISTINCT FROM v_company_id)
    LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.contacts (
      organization_id, company_id, first_name, last_name,
      email, phone, role_title, status,
      source_id, extracted_at, extraction_model
    )
    VALUES (
      p_org_id, v_company_id,
      COALESCE(NULLIF(v_first,''), 'Unbekannt'),
      COALESCE(NULLIF(v_last,''),  ''),
      NULLIF(TRIM(p_email),''),
      NULLIF(TRIM(p_phone),''),
      NULLIF(TRIM(p_role_title),''),
      COALESCE(NULLIF(p_status,''), 'active'),
      p_source_id, NOW(), p_extraction_model
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.contacts
    SET company_id       = COALESCE(v_company_id, company_id),
        email            = COALESCE(NULLIF(TRIM(p_email),''),      email),
        phone            = COALESCE(NULLIF(TRIM(p_phone),''),      phone),
        role_title       = COALESCE(NULLIF(TRIM(p_role_title),''), role_title),
        status           = COALESCE(NULLIF(p_status,''),           status),
        source_id        = p_source_id,
        extracted_at     = NOW(),
        extraction_model = p_extraction_model,
        updated_at       = NOW()
    WHERE id = v_id
      AND extracted_at IS NOT NULL;
  END IF;

  FOREACH v_tag IN ARRAY p_tags LOOP
    PERFORM public.ensure_entity_tag(p_org_id, 'contact', v_id, v_tag);
  END LOOP;

  RETURN v_id;
END;
$$;

-- ─── UPSERT PROJECT FROM EXTRACTION ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_project_from_extraction(
  p_org_id           UUID,
  p_source_id        UUID,
  p_name             TEXT,
  p_company_name     TEXT,
  p_status           TEXT,
  p_description      TEXT,
  p_extraction_model TEXT,
  p_tags             TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id          UUID;
  v_company_id  UUID;
  v_clean       TEXT := TRIM(COALESCE(p_name, ''));
  v_tag         TEXT;
BEGIN
  IF v_clean = '' THEN RETURN NULL; END IF;

  IF NULLIF(TRIM(COALESCE(p_company_name,'')), '') IS NOT NULL THEN
    v_company_id := public.upsert_company_from_extraction(
      p_org_id, p_source_id, p_company_name, NULL, NULL, p_extraction_model, ARRAY[]::TEXT[]
    );
  END IF;

  SELECT id INTO v_id
  FROM public.projects
  WHERE organization_id = p_org_id AND LOWER(name) = LOWER(v_clean)
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.projects (
      organization_id, company_id, name, status, description,
      source_id, extracted_at, extraction_model
    )
    VALUES (
      p_org_id, v_company_id, v_clean,
      COALESCE(NULLIF(p_status,''), 'active'),
      NULLIF(TRIM(p_description),''),
      p_source_id, NOW(), p_extraction_model
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.projects
    SET company_id       = COALESCE(v_company_id, company_id),
        status           = COALESCE(NULLIF(p_status,''), status),
        description      = COALESCE(NULLIF(TRIM(p_description),''), description),
        source_id        = p_source_id,
        extracted_at     = NOW(),
        extraction_model = p_extraction_model,
        updated_at       = NOW()
    WHERE id = v_id
      AND extracted_at IS NOT NULL;
  END IF;

  FOREACH v_tag IN ARRAY p_tags LOOP
    PERFORM public.ensure_entity_tag(p_org_id, 'project', v_id, v_tag);
  END LOOP;

  RETURN v_id;
END;
$$;

-- ─── DELETE AUTO-EXTRACTED BY SOURCE ──────────────────────────────────────
--
-- Called at the start of a re-extraction run to wipe the previous
-- auto-extracted rows linked to a source. Manual rows (extracted_at IS
-- NULL) are preserved. entity_tags cascade via entity_id FK logic in the
-- tags migration; here we delete them explicitly so removed rows don't
-- leave orphaned tag-links.

CREATE OR REPLACE FUNCTION public.delete_auto_extracted_by_source(
  p_org_id    UUID,
  p_source_id UUID
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.entity_tags et
  WHERE et.organization_id = p_org_id
    AND (
      (et.entity_type = 'contact' AND et.entity_id IN (
        SELECT id FROM public.contacts
        WHERE organization_id = p_org_id AND source_id = p_source_id AND extracted_at IS NOT NULL))
      OR
      (et.entity_type = 'company' AND et.entity_id IN (
        SELECT id FROM public.companies
        WHERE organization_id = p_org_id AND source_id = p_source_id AND extracted_at IS NOT NULL))
      OR
      (et.entity_type = 'project' AND et.entity_id IN (
        SELECT id FROM public.projects
        WHERE organization_id = p_org_id AND source_id = p_source_id AND extracted_at IS NOT NULL))
    );

  DELETE FROM public.contacts
  WHERE organization_id = p_org_id AND source_id = p_source_id AND extracted_at IS NOT NULL;

  DELETE FROM public.projects
  WHERE organization_id = p_org_id AND source_id = p_source_id AND extracted_at IS NOT NULL;

  DELETE FROM public.companies
  WHERE organization_id = p_org_id AND source_id = p_source_id AND extracted_at IS NOT NULL;
END;
$$;

-- ─── BACKFILL HELPER ─────────────────────────────────────────────────────
--
-- Enqueues one extract message per existing source in the org. Safe to
-- call repeatedly — the worker will wipe and rebuild each source. Used
-- once after deploy to kick off extraction on already-ingested content.

CREATE OR REPLACE FUNCTION public.enqueue_extract_for_org(p_org_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pgmq AS $$
DECLARE
  v_count INTEGER := 0;
  v_source RECORD;
BEGIN
  FOR v_source IN
    SELECT id FROM public.sources
    WHERE organization_id = p_org_id
      AND status = 'ready'
      AND deleted_at IS NULL
  LOOP
    PERFORM pgmq.send('extract', jsonb_build_object(
      'organization_id', p_org_id,
      'source_id',       v_source.id
    ));
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_entity_tag(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_contact_from_extraction(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_company_from_extraction(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_project_from_extraction(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_auto_extracted_by_source(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_extract_for_org(UUID) TO authenticated, service_role;
