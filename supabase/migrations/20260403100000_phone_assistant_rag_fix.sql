-- Migration: phone_assistant_rag_fix
-- Fixes RAG tool usage by updating system prompt and adding contact-aware search functions

-- ─── UPDATE SYSTEM PROMPT ──────────────────────────────────────────────────
-- Update existing assistants that still have the old default prompt
UPDATE phone_assistants
SET system_prompt = 'Du bist ein hilfreicher Telefonassistent. Du hast Zugriff auf vergangene Gespraeche, Anruf-Transkripte, Notizen und alle Unternehmensinformationen ueber das search_knowledge Tool. Nutze es IMMER wenn nach Informationen, vergangenen Gespraechen, Kontakten oder Fakten gefragt wird. Wenn jemand nach einer bestimmten Person fragt, nutze search_knowledge_for_contact mit dem Namen. Antworte praezise und freundlich auf Deutsch.'
WHERE system_prompt = 'Du bist ein hilfreicher Telefonassistent. Beantworte Fragen basierend auf der Wissensbasis des Unternehmens. Antworte praezise und freundlich.';

-- Update column default for new orgs
ALTER TABLE phone_assistants
  ALTER COLUMN system_prompt
  SET DEFAULT 'Du bist ein hilfreicher Telefonassistent. Du hast Zugriff auf vergangene Gespraeche, Anruf-Transkripte, Notizen und alle Unternehmensinformationen ueber das search_knowledge Tool. Nutze es IMMER wenn nach Informationen, vergangenen Gespraechen, Kontakten oder Fakten gefragt wird. Wenn jemand nach einer bestimmten Person fragt, nutze search_knowledge_for_contact mit dem Namen. Antworte praezise und freundlich auf Deutsch.';

-- ─── CONTACT NAME SEARCH ───────────────────────────────────────────────────
-- Fuzzy search for contacts by name (used by phone assistant RAG)
CREATE OR REPLACE FUNCTION search_contact_by_name(p_org_id UUID, p_name TEXT)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  company_name TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    c.id,
    c.first_name,
    c.last_name,
    c.phone,
    c.email,
    co.name AS company_name
  FROM contacts c
  LEFT JOIN companies co ON co.id = c.company_id
  WHERE c.organization_id = p_org_id
    AND c.status = 'active'
    AND (
      LOWER(c.first_name || ' ' || c.last_name) LIKE '%' || LOWER(TRIM(p_name)) || '%'
      OR LOWER(c.last_name) LIKE '%' || LOWER(TRIM(p_name)) || '%'
      OR LOWER(c.first_name) LIKE '%' || LOWER(TRIM(p_name)) || '%'
    )
  ORDER BY
    CASE
      WHEN LOWER(c.first_name || ' ' || c.last_name) = LOWER(TRIM(p_name)) THEN 0
      WHEN LOWER(c.last_name) = LOWER(TRIM(p_name)) THEN 1
      ELSE 2
    END
  LIMIT 5;
$$;

-- ─── BOOSTED SOURCE IDS FOR CONTACT ────────────────────────────────────────
-- Returns source IDs linked to a contact (for hybrid_search_boosted)
CREATE OR REPLACE FUNCTION get_boosted_source_ids_for_contact(p_org_id UUID, p_contact_id UUID)
RETURNS UUID[]
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COALESCE(array_agg(sl.source_id), '{}')
  FROM source_links sl
  WHERE sl.organization_id = p_org_id
    AND sl.linked_type = 'contact'
    AND sl.linked_id = p_contact_id;
$$;
