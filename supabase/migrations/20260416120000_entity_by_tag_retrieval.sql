-- Migration: entity_by_tag_retrieval
--
-- Adds RPC functions that join entity_tags DIRECTLY with contacts/companies/
-- projects — without going through content_chunks or source_links. Until now
-- the chat retrieval only knew the path "tag → linked documents", which
-- silently dropped entities that carry a tag but aren't linked to any source
-- (the normal case for pure CRM contacts). The chat then showed "no
-- information" for questions like "gib mir alle Pilot-Kontakte" even though
-- the tagged rows existed in the DB.
--
-- SECURITY INVOKER (default): the RLS policies on entity_tags / contacts /
-- companies / projects do the access control. Do NOT switch to DEFINER.

-- ─── LIST ENTITIES BY TAG ────────────────────────────────────────────────
--
-- Returns all entities in the given types that carry at least one of the
-- given tags. `matched_tag_names` lists only the tags that matched the
-- filter, so the chat layer can show *why* a row ended up in the result.
-- `chunk_text` is a denormalized, LLM-ready summary that the TS wrapper can
-- surface as-is; cheaper than a second round-trip per row.

CREATE OR REPLACE FUNCTION public.list_entities_by_tag(
  p_org_id    UUID,
  p_tag_ids   UUID[],
  p_types     TEXT[] DEFAULT ARRAY['contact','company','project']::TEXT[],
  p_limit     INTEGER DEFAULT 200
)
RETURNS TABLE (
  entity_type         TEXT,
  entity_id           UUID,
  display_name        TEXT,
  entity_status       TEXT,
  company_name        TEXT,
  matched_tag_names   TEXT[],
  chunk_text          TEXT
)
LANGUAGE sql STABLE AS $$
  WITH matched AS (
    SELECT et.entity_type, et.entity_id,
           array_agg(DISTINCT t.name ORDER BY t.name) AS matched
    FROM public.entity_tags et
    JOIN public.tags t ON t.id = et.tag_id
    WHERE et.organization_id = p_org_id
      AND et.tag_id = ANY (p_tag_ids)
      AND et.entity_type = ANY (p_types)
    GROUP BY et.entity_type, et.entity_id
  )
  SELECT
    'contact'::TEXT,
    c.id,
    TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),
    c.status,
    co.name,
    m.matched,
    CONCAT_WS(E'\n',
      'Name: ' || TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),
      CASE WHEN co.name IS NOT NULL THEN 'Unternehmen: ' || co.name END,
      CASE WHEN c.role_title IS NOT NULL THEN 'Rolle: ' || c.role_title END,
      CASE WHEN c.email IS NOT NULL THEN 'E-Mail: ' || c.email END,
      CASE WHEN c.phone IS NOT NULL THEN 'Telefon: ' || c.phone END,
      'Status: ' || c.status,
      'Tags: ' || array_to_string(m.matched, ', '),
      CASE WHEN c.notes IS NOT NULL THEN 'Notizen: ' || c.notes END
    )
  FROM matched m
  JOIN public.contacts c ON c.id = m.entity_id AND m.entity_type = 'contact'
  LEFT JOIN public.companies co ON co.id = c.company_id
  WHERE c.organization_id = p_org_id

  UNION ALL

  SELECT
    'company'::TEXT,
    co.id,
    co.name,
    co.status,
    NULL::TEXT,
    m.matched,
    CONCAT_WS(E'\n',
      'Unternehmen: ' || co.name,
      CASE WHEN co.website IS NOT NULL THEN 'Website: ' || co.website END,
      'Status: ' || co.status,
      'Tags: ' || array_to_string(m.matched, ', '),
      CASE WHEN co.notes IS NOT NULL THEN 'Notizen: ' || co.notes END
    )
  FROM matched m
  JOIN public.companies co ON co.id = m.entity_id AND m.entity_type = 'company'
  WHERE co.organization_id = p_org_id

  UNION ALL

  SELECT
    'project'::TEXT,
    p.id,
    p.name,
    p.status,
    co.name,
    m.matched,
    CONCAT_WS(E'\n',
      'Projekt: ' || p.name,
      CASE WHEN co.name IS NOT NULL THEN 'Kunde: ' || co.name END,
      'Status: ' || p.status,
      'Tags: ' || array_to_string(m.matched, ', '),
      CASE WHEN p.description IS NOT NULL THEN 'Beschreibung: ' || p.description END
    )
  FROM matched m
  JOIN public.projects p ON p.id = m.entity_id AND m.entity_type = 'project'
  LEFT JOIN public.companies co ON co.id = p.company_id
  WHERE p.organization_id = p_org_id

  LIMIT p_limit;
$$;

-- ─── LIST ENTITIES BY STATUS ─────────────────────────────────────────────
--
-- Sibling of list_entities_by_tag for status-driven questions like
-- "alle aktiven Kunden" / "alle offenen Projekte". Filter by the status
-- column on each entity table. Tag array is returned only as informational
-- context (all tags, not filtered).

CREATE OR REPLACE FUNCTION public.list_entities_by_status(
  p_org_id   UUID,
  p_types    TEXT[],
  p_status   TEXT[],
  p_limit    INTEGER DEFAULT 200
)
RETURNS TABLE (
  entity_type    TEXT,
  entity_id      UUID,
  display_name   TEXT,
  entity_status  TEXT,
  company_name   TEXT,
  all_tag_names  TEXT[],
  chunk_text     TEXT
)
LANGUAGE sql STABLE AS $$
  WITH all_tags AS (
    SELECT et.entity_type, et.entity_id,
           array_agg(DISTINCT t.name ORDER BY t.name) AS names
    FROM public.entity_tags et
    JOIN public.tags t ON t.id = et.tag_id
    WHERE et.organization_id = p_org_id
      AND et.entity_type = ANY (p_types)
    GROUP BY et.entity_type, et.entity_id
  )
  SELECT
    'contact'::TEXT,
    c.id,
    TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),
    c.status,
    co.name,
    COALESCE(tg.names, ARRAY[]::TEXT[]),
    CONCAT_WS(E'\n',
      'Name: ' || TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')),
      CASE WHEN co.name IS NOT NULL THEN 'Unternehmen: ' || co.name END,
      CASE WHEN c.role_title IS NOT NULL THEN 'Rolle: ' || c.role_title END,
      CASE WHEN c.email IS NOT NULL THEN 'E-Mail: ' || c.email END,
      'Status: ' || c.status,
      CASE WHEN tg.names IS NOT NULL THEN 'Tags: ' || array_to_string(tg.names, ', ') END,
      CASE WHEN c.notes IS NOT NULL THEN 'Notizen: ' || c.notes END
    )
  FROM public.contacts c
  LEFT JOIN public.companies co ON co.id = c.company_id
  LEFT JOIN all_tags tg ON tg.entity_type = 'contact' AND tg.entity_id = c.id
  WHERE c.organization_id = p_org_id
    AND 'contact' = ANY (p_types)
    AND c.status = ANY (p_status)

  UNION ALL

  SELECT
    'company'::TEXT,
    co.id,
    co.name,
    co.status,
    NULL::TEXT,
    COALESCE(tg.names, ARRAY[]::TEXT[]),
    CONCAT_WS(E'\n',
      'Unternehmen: ' || co.name,
      CASE WHEN co.website IS NOT NULL THEN 'Website: ' || co.website END,
      'Status: ' || co.status,
      CASE WHEN tg.names IS NOT NULL THEN 'Tags: ' || array_to_string(tg.names, ', ') END,
      CASE WHEN co.notes IS NOT NULL THEN 'Notizen: ' || co.notes END
    )
  FROM public.companies co
  LEFT JOIN all_tags tg ON tg.entity_type = 'company' AND tg.entity_id = co.id
  WHERE co.organization_id = p_org_id
    AND 'company' = ANY (p_types)
    AND co.status = ANY (p_status)

  UNION ALL

  SELECT
    'project'::TEXT,
    p.id,
    p.name,
    p.status,
    co.name,
    COALESCE(tg.names, ARRAY[]::TEXT[]),
    CONCAT_WS(E'\n',
      'Projekt: ' || p.name,
      CASE WHEN co.name IS NOT NULL THEN 'Kunde: ' || co.name END,
      'Status: ' || p.status,
      CASE WHEN tg.names IS NOT NULL THEN 'Tags: ' || array_to_string(tg.names, ', ') END,
      CASE WHEN p.description IS NOT NULL THEN 'Beschreibung: ' || p.description END
    )
  FROM public.projects p
  LEFT JOIN public.companies co ON co.id = p.company_id
  LEFT JOIN all_tags tg ON tg.entity_type = 'project' AND tg.entity_id = p.id
  WHERE p.organization_id = p_org_id
    AND 'project' = ANY (p_types)
    AND p.status = ANY (p_status)

  LIMIT p_limit;
$$;
