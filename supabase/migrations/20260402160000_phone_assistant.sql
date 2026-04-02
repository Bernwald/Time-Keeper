-- Phone Assistant module: AI-powered inbound phone assistant with RAG
-- Premium feature flag: phone_assistant

-- Enable moddatetime extension for updated_at triggers
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- ─── TABLES ────────────────────────────────────────────────────────────────

-- Config per org (1:1)
CREATE TABLE phone_assistants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'Telefonassistent',
  status        TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive','active','paused')),

  -- Provider config
  provider              TEXT NOT NULL DEFAULT 'vapi',
  provider_assistant_id TEXT,

  -- Prompts & greetings
  system_prompt   TEXT DEFAULT 'Du bist ein hilfreicher Telefonassistent. Beantworte Fragen basierend auf der Wissensbasis des Unternehmens. Antworte praezise und freundlich.',
  greeting_de     TEXT DEFAULT 'Hallo, willkommen! Wie kann ich Ihnen helfen?',
  greeting_en     TEXT DEFAULT 'Hello, welcome! How can I help you?',

  -- Voice config
  voice_id_de     TEXT DEFAULT 'alloy',
  voice_id_en     TEXT DEFAULT 'alloy',
  language_mode   TEXT NOT NULL DEFAULT 'auto' CHECK (language_mode IN ('auto','de','en')),

  -- RAG config
  max_chunks      INT NOT NULL DEFAULT 5,
  boost_factor    NUMERIC(4,2) NOT NULL DEFAULT 1.5,

  -- Call limits
  max_call_duration_seconds INT NOT NULL DEFAULT 600,
  business_hours_start      TIME,
  business_hours_end        TIME,
  business_hours_tz         TEXT DEFAULT 'Europe/Berlin',
  after_hours_message       TEXT DEFAULT 'Unser Telefonassistent ist derzeit nicht erreichbar. Bitte versuchen Sie es waehrend unserer Geschaeftszeiten erneut.',

  -- Metadata
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_phone_assistant_org UNIQUE (organization_id)
);

-- Phone numbers per org (1:n)
CREATE TABLE phone_numbers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assistant_id    UUID NOT NULL REFERENCES phone_assistants(id) ON DELETE CASCADE,
  phone_number    TEXT NOT NULL,
  display_name    TEXT,
  provider_phone_id TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','inactive','failed')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_phone_number UNIQUE (phone_number)
);

-- Call logs
CREATE TABLE call_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assistant_id    UUID NOT NULL REFERENCES phone_assistants(id) ON DELETE CASCADE,
  phone_number_id UUID REFERENCES phone_numbers(id) ON DELETE SET NULL,

  -- Provider reference
  provider_call_id TEXT,

  -- Call details
  caller_number   TEXT,
  called_number   TEXT,
  status          TEXT NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','in_progress','completed','failed','missed','voicemail')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  duration_seconds INT,

  -- Content
  transcript      TEXT,
  summary         TEXT,
  detected_language TEXT,

  -- Recording
  recording_url   TEXT,

  -- Links to other entities
  source_id       UUID REFERENCES sources(id) ON DELETE SET NULL,
  activity_id     UUID REFERENCES activities(id) ON DELETE SET NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,

  -- Cost tracking
  cost_cents      INT,

  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_provider_call UNIQUE (provider_call_id)
);

-- Indexes
CREATE INDEX idx_phone_numbers_org ON phone_numbers(organization_id);
CREATE INDEX idx_phone_numbers_number ON phone_numbers(phone_number);
CREATE INDEX idx_call_logs_org ON call_logs(organization_id);
CREATE INDEX idx_call_logs_started ON call_logs(organization_id, started_at DESC);
CREATE INDEX idx_call_logs_contact ON call_logs(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX idx_call_logs_provider ON call_logs(provider_call_id) WHERE provider_call_id IS NOT NULL;

-- Updated_at triggers
CREATE TRIGGER set_phone_assistants_updated_at
  BEFORE UPDATE ON phone_assistants
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_phone_numbers_updated_at
  BEFORE UPDATE ON phone_numbers
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

CREATE TRIGGER set_call_logs_updated_at
  BEFORE UPDATE ON call_logs
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- ─── RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE phone_assistants ENABLE ROW LEVEL SECURITY;
ALTER TABLE phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs ENABLE ROW LEVEL SECURITY;

-- phone_assistants
CREATE POLICY "org members read phone_assistants" ON phone_assistants
  FOR SELECT USING (is_member_of_org(organization_id));
CREATE POLICY "org members write phone_assistants" ON phone_assistants
  FOR ALL USING (is_member_of_org(organization_id));

-- phone_numbers
CREATE POLICY "org members read phone_numbers" ON phone_numbers
  FOR SELECT USING (is_member_of_org(organization_id));
CREATE POLICY "org members write phone_numbers" ON phone_numbers
  FOR ALL USING (is_member_of_org(organization_id));

-- call_logs
CREATE POLICY "org members read call_logs" ON call_logs
  FOR SELECT USING (is_member_of_org(organization_id));
CREATE POLICY "org members write call_logs" ON call_logs
  FOR ALL USING (is_member_of_org(organization_id));

-- ─── FUNCTIONS ─────────────────────────────────────────────────────────────

-- Resolve phone number to org + assistant config (for Edge Function, no RLS)
CREATE OR REPLACE FUNCTION get_org_for_phone_number(p_phone_number TEXT)
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
  FROM phone_numbers pn
  JOIN phone_assistants pa ON pa.id = pn.assistant_id
  WHERE pn.phone_number = p_phone_number
    AND pn.status = 'active'
    AND pa.status = 'active'
  LIMIT 1;
$$;

-- Call statistics for dashboard
CREATE OR REPLACE FUNCTION get_call_stats(p_org_id UUID, p_days INT DEFAULT 30)
RETURNS TABLE (
  total_calls BIGINT,
  completed_calls BIGINT,
  missed_calls BIGINT,
  avg_duration_seconds NUMERIC,
  total_duration_seconds BIGINT,
  calls_de BIGINT,
  calls_en BIGINT,
  calls_other BIGINT,
  total_cost_cents BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    COUNT(*)::BIGINT AS total_calls,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_calls,
    COUNT(*) FILTER (WHERE status IN ('missed','failed'))::BIGINT AS missed_calls,
    ROUND(AVG(duration_seconds) FILTER (WHERE duration_seconds > 0), 1) AS avg_duration_seconds,
    COALESCE(SUM(duration_seconds) FILTER (WHERE duration_seconds > 0), 0)::BIGINT AS total_duration_seconds,
    COUNT(*) FILTER (WHERE detected_language = 'de')::BIGINT AS calls_de,
    COUNT(*) FILTER (WHERE detected_language = 'en')::BIGINT AS calls_en,
    COUNT(*) FILTER (WHERE detected_language IS NULL OR detected_language NOT IN ('de','en'))::BIGINT AS calls_other,
    COALESCE(SUM(cost_cents), 0)::BIGINT AS total_cost_cents
  FROM call_logs
  WHERE organization_id = p_org_id
    AND started_at >= now() - (p_days || ' days')::INTERVAL;
$$;

-- Match caller number to contact
CREATE OR REPLACE FUNCTION match_caller_to_contact(p_org_id UUID, p_caller_number TEXT)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id FROM contacts
  WHERE organization_id = p_org_id
    AND phone IS NOT NULL
    AND (
      phone = p_caller_number
      OR REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') =
         REPLACE(REPLACE(REPLACE(p_caller_number, ' ', ''), '-', ''), '+', '')
    )
  LIMIT 1;
$$;

-- ─── FEATURE FLAG ──────────────────────────────────────────────────────────

INSERT INTO feature_flags (key, name, description, is_core)
VALUES (
  'phone_assistant',
  'KI-Telefonassistent',
  'Inbound AI-Telefonassistent mit RAG-Anbindung an die Wissensbasis',
  false
)
ON CONFLICT (key) DO NOTHING;
