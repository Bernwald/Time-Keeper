-- Resolve Vapi provider_assistant_id to org + assistant config
-- Used as fallback when no phone number is available (e.g. Vapi Talk button in browser)
CREATE OR REPLACE FUNCTION get_org_for_provider_assistant(p_provider_assistant_id TEXT)
RETURNS TABLE (
  org_id UUID,
  assistant_id UUID,
  assistant_name TEXT,
  system_prompt TEXT,
  greeting_de TEXT,
  greeting_en TEXT,
  voice_id_de TEXT,
  voice_id_en TEXT,
  language_mode TEXT,
  max_chunks INT,
  boost_factor NUMERIC,
  max_call_duration_seconds INT,
  business_hours_start TIME,
  business_hours_end TIME,
  business_hours_tz TEXT,
  after_hours_message TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    pa.organization_id,
    pa.id,
    pa.name,
    pa.system_prompt,
    pa.greeting_de,
    pa.greeting_en,
    pa.voice_id_de,
    pa.voice_id_en,
    pa.language_mode,
    pa.max_chunks,
    pa.boost_factor,
    pa.max_call_duration_seconds,
    pa.business_hours_start,
    pa.business_hours_end,
    pa.business_hours_tz,
    pa.after_hours_message
  FROM phone_assistants pa
  WHERE pa.provider_assistant_id = p_provider_assistant_id
    AND pa.status = 'active'
  LIMIT 1;
$$;
