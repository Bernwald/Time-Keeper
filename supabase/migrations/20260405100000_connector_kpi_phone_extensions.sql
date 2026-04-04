-- Migration: connector_kpi_phone_extensions
-- Adds: Unified Connector Layer, KPI Engine, Phone Assistant enrichment features
-- (Caller Context, Post-Call Action Items, Auto-Tagging, Notifications)

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1: UNIFIED CONNECTOR LAYER
-- ═══════════════════════════════════════════════════════════════════════════

-- Extend integration_providers category to include 'erp'
ALTER TABLE public.integration_providers
  DROP CONSTRAINT IF EXISTS integration_providers_category_check;
ALTER TABLE public.integration_providers
  ADD CONSTRAINT integration_providers_category_check
    CHECK (category IN ('voice','calendar','crm','erp','ai','storage','messaging','webhook'));

-- Entity mappings: link TimeKeeper records to external system IDs
CREATE TABLE IF NOT EXISTS public.entity_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_id     TEXT NOT NULL REFERENCES public.integration_providers(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('contact','company','deal','invoice','appointment','product','activity')),
  local_id        UUID NOT NULL,
  external_id     TEXT NOT NULL,
  external_data   JSONB NOT NULL DEFAULT '{}',
  last_synced_at  TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, provider_id, entity_type, external_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_mappings_org ON public.entity_mappings(organization_id, provider_id);
CREATE INDEX IF NOT EXISTS idx_entity_mappings_local ON public.entity_mappings(organization_id, entity_type, local_id);
CREATE INDEX IF NOT EXISTS idx_entity_mappings_external ON public.entity_mappings(organization_id, provider_id, entity_type, external_id);

-- Connector sync log: audit trail for all sync operations
CREATE TABLE IF NOT EXISTS public.connector_sync_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider_id     TEXT NOT NULL REFERENCES public.integration_providers(id) ON DELETE CASCADE,
  direction       TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  entity_type     TEXT NOT NULL,
  entity_id       TEXT,
  local_id        UUID,
  status          TEXT NOT NULL CHECK (status IN ('success','error','skipped')),
  payload_hash    TEXT,
  error_message   TEXT,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_connector_sync_log_org ON public.connector_sync_log(organization_id, provider_id, synced_at DESC);

-- Triggers
DROP TRIGGER IF EXISTS set_updated_at_entity_mappings ON public.entity_mappings;
CREATE TRIGGER set_updated_at_entity_mappings
  BEFORE UPDATE ON public.entity_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.entity_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connector_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entity_mappings_org_all" ON public.entity_mappings;
CREATE POLICY "entity_mappings_org_all" ON public.entity_mappings
  FOR ALL USING (public.is_member_of_org(organization_id))
  WITH CHECK (public.is_member_of_org(organization_id));

DROP POLICY IF EXISTS "connector_sync_log_org_read" ON public.connector_sync_log;
CREATE POLICY "connector_sync_log_org_read" ON public.connector_sync_log
  FOR SELECT USING (public.is_member_of_org(organization_id));

DROP POLICY IF EXISTS "connector_sync_log_org_write" ON public.connector_sync_log;
CREATE POLICY "connector_sync_log_org_write" ON public.connector_sync_log
  FOR ALL USING (public.is_member_of_org(organization_id));

-- Seed: Generic Webhook provider (works with any system via Zapier/Make/n8n/custom)
INSERT INTO public.integration_providers (id, name, category, auth_type, config_schema, feature_key, is_active)
VALUES (
  'generic_webhook',
  'Webhook (Zapier/Make/n8n)',
  'webhook',
  'webhook',
  '{"fields": [{"key": "webhook_url", "label": "Webhook-URL", "type": "url"}, {"key": "secret", "label": "Webhook-Secret", "type": "password"}]}'::JSONB,
  NULL,
  TRUE
)
ON CONFLICT (id) DO NOTHING;

-- Helper: resolve external entity for a local record
CREATE OR REPLACE FUNCTION public.get_external_entity(
  p_org_id UUID,
  p_provider_id TEXT,
  p_entity_type TEXT,
  p_local_id UUID
)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT external_data
  FROM public.entity_mappings
  WHERE organization_id = p_org_id
    AND provider_id = p_provider_id
    AND entity_type = p_entity_type
    AND local_id = p_local_id
  LIMIT 1;
$$;

-- Helper: get sync stats for dashboard
CREATE OR REPLACE FUNCTION public.get_connector_sync_stats(
  p_org_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  provider_id TEXT,
  total_syncs BIGINT,
  successful_syncs BIGINT,
  failed_syncs BIGINT,
  last_sync TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT
    provider_id,
    COUNT(*)::BIGINT AS total_syncs,
    COUNT(*) FILTER (WHERE status = 'success')::BIGINT AS successful_syncs,
    COUNT(*) FILTER (WHERE status = 'error')::BIGINT AS failed_syncs,
    MAX(synced_at) AS last_sync
  FROM public.connector_sync_log
  WHERE organization_id = p_org_id
    AND synced_at >= now() - (p_days || ' days')::INTERVAL
  GROUP BY provider_id;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2: KPI ENGINE
-- ═══════════════════════════════════════════════════════════════════════════

-- KPI events: granular tracking of automated actions
CREATE TABLE IF NOT EXISTS public.kpi_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  feature_key     TEXT REFERENCES public.feature_flags(key) ON DELETE SET NULL,
  value           NUMERIC NOT NULL DEFAULT 1,
  metadata        JSONB NOT NULL DEFAULT '{}',
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kpi_events_org_feature ON public.kpi_events(organization_id, feature_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_events_org_type ON public.kpi_events(organization_id, event_type, occurred_at DESC);

-- KPI baselines: customer-specific comparison values
CREATE TABLE IF NOT EXISTS public.kpi_baselines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_key      TEXT NOT NULL,
  value           NUMERIC NOT NULL,
  unit            TEXT NOT NULL DEFAULT 'count',
  set_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, metric_key)
);

-- RLS
ALTER TABLE public.kpi_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_baselines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kpi_events_org_read" ON public.kpi_events;
CREATE POLICY "kpi_events_org_read" ON public.kpi_events
  FOR SELECT USING (public.is_member_of_org(organization_id));

DROP POLICY IF EXISTS "kpi_events_org_write" ON public.kpi_events;
CREATE POLICY "kpi_events_org_write" ON public.kpi_events
  FOR ALL USING (public.is_member_of_org(organization_id));

DROP POLICY IF EXISTS "kpi_baselines_org_all" ON public.kpi_baselines;
CREATE POLICY "kpi_baselines_org_all" ON public.kpi_baselines
  FOR ALL USING (public.is_member_of_org(organization_id))
  WITH CHECK (public.is_member_of_org(organization_id));

-- Record a KPI event (callable from edge functions via service role)
CREATE OR REPLACE FUNCTION public.record_kpi_event(
  p_org_id UUID,
  p_event_type TEXT,
  p_feature_key TEXT DEFAULT NULL,
  p_value NUMERIC DEFAULT 1,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.kpi_events (organization_id, event_type, feature_key, value, metadata)
  VALUES (p_org_id, p_event_type, p_feature_key, p_value, p_metadata)
  RETURNING id;
$$;

-- KPI summary for dashboard
CREATE OR REPLACE FUNCTION public.get_kpi_summary(
  p_org_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  calls_handled BIGINT,
  appointments_booked BIGINT,
  action_items_extracted BIGINT,
  callers_identified BIGINT,
  time_saved_seconds NUMERIC,
  time_saved_hours NUMERIC,
  total_events BIGINT,
  cost_per_call_avg NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH events AS (
    SELECT event_type, value
    FROM public.kpi_events
    WHERE organization_id = p_org_id
      AND occurred_at >= now() - (p_days || ' days')::INTERVAL
  ),
  call_costs AS (
    SELECT AVG(cost_cents) AS avg_cost
    FROM public.call_logs
    WHERE organization_id = p_org_id
      AND started_at >= now() - (p_days || ' days')::INTERVAL
      AND cost_cents IS NOT NULL
  )
  SELECT
    COUNT(*) FILTER (WHERE event_type = 'call_handled')::BIGINT,
    COUNT(*) FILTER (WHERE event_type = 'appointment_booked')::BIGINT,
    COUNT(*) FILTER (WHERE event_type = 'action_items_extracted')::BIGINT,
    COUNT(*) FILTER (WHERE event_type = 'caller_identified')::BIGINT,
    COALESCE(SUM(value) FILTER (WHERE event_type = 'time_saved_seconds'), 0),
    ROUND(COALESCE(SUM(value) FILTER (WHERE event_type = 'time_saved_seconds'), 0) / 3600.0, 1),
    COUNT(*)::BIGINT,
    (SELECT ROUND(avg_cost / 100.0, 2) FROM call_costs)
  FROM events;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3: PHONE ASSISTANT ENRICHMENT
-- ═══════════════════════════════════════════════════════════════════════════

-- Add notification settings to phone_assistants
ALTER TABLE public.phone_assistants
  ADD COLUMN IF NOT EXISTS notification_email TEXT,
  ADD COLUMN IF NOT EXISTS notification_mode TEXT NOT NULL DEFAULT 'none'
    CHECK (notification_mode IN ('none','email'));

-- Add enrichment columns to call_logs
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS action_items JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS auto_tags TEXT[] DEFAULT '{}';

-- Index for tag-based filtering
CREATE INDEX IF NOT EXISTS idx_call_logs_auto_tags ON public.call_logs USING GIN (auto_tags);

-- Caller context: assemble a briefing for the assistant when a known caller rings
CREATE OR REPLACE FUNCTION public.get_caller_context(
  p_org_id UUID,
  p_caller_number TEXT
)
RETURNS TABLE (
  contact_id UUID,
  contact_name TEXT,
  company_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  recent_activities JSONB,
  open_processes JSONB,
  next_appointment JSONB
)
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_contact_id UUID;
  v_contact_name TEXT;
  v_company_name TEXT;
  v_contact_email TEXT;
  v_contact_phone TEXT;
  v_recent_activities JSONB;
  v_open_processes JSONB;
  v_next_appointment JSONB;
BEGIN
  -- Match caller to contact
  SELECT c.id, CONCAT(c.first_name, ' ', c.last_name), co.name, c.email, c.phone
  INTO v_contact_id, v_contact_name, v_company_name, v_contact_email, v_contact_phone
  FROM public.contacts c
  LEFT JOIN public.companies co ON co.id = c.company_id
  WHERE c.organization_id = p_org_id
    AND c.phone IS NOT NULL
    AND (
      c.phone = p_caller_number
      OR REPLACE(REPLACE(REPLACE(c.phone, ' ', ''), '-', ''), '+', '') =
         REPLACE(REPLACE(REPLACE(p_caller_number, ' ', ''), '-', ''), '+', '')
    )
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    RETURN;
  END IF;

  -- Last 3 activities linked to this contact
  SELECT COALESCE(jsonb_agg(row_to_json(a)::JSONB), '[]'::JSONB)
  INTO v_recent_activities
  FROM (
    SELECT a.title, a.activity_type, a.description,
           TO_CHAR(a.occurred_at, 'DD.MM.YYYY') AS date
    FROM public.activities a
    JOIN public.activity_links al ON al.activity_id = a.id
    WHERE al.linked_type = 'contact' AND al.linked_id = v_contact_id
      AND a.organization_id = p_org_id
    ORDER BY a.occurred_at DESC
    LIMIT 3
  ) a;

  -- Open process instances linked to this contact's company
  SELECT COALESCE(jsonb_agg(row_to_json(p)::JSONB), '[]'::JSONB)
  INTO v_open_processes
  FROM (
    SELECT pi.name, pi.status,
           TO_CHAR(pi.started_at, 'DD.MM.YYYY') AS started
    FROM public.process_instances pi
    JOIN public.contacts c ON c.company_id = pi.company_id
    WHERE c.id = v_contact_id
      AND pi.organization_id = p_org_id
      AND pi.status = 'active'
    ORDER BY pi.started_at DESC
    LIMIT 3
  ) p;

  -- Next upcoming appointment (from call_logs with future appointments or calendar)
  -- Simple: check last scheduled appointment from activities
  SELECT row_to_json(apt)::JSONB
  INTO v_next_appointment
  FROM (
    SELECT a.title, TO_CHAR(a.occurred_at, 'DD.MM.YYYY HH24:MI') AS datetime
    FROM public.activities a
    JOIN public.activity_links al ON al.activity_id = a.id
    WHERE al.linked_type = 'contact' AND al.linked_id = v_contact_id
      AND a.organization_id = p_org_id
      AND a.activity_type = 'appointment'
      AND a.occurred_at > now()
    ORDER BY a.occurred_at ASC
    LIMIT 1
  ) apt;

  RETURN QUERY SELECT
    v_contact_id, v_contact_name, v_company_name, v_contact_email, v_contact_phone,
    v_recent_activities, v_open_processes, v_next_appointment;
END;
$$;

-- Call category stats for dashboard
CREATE OR REPLACE FUNCTION public.get_call_category_stats(
  p_org_id UUID,
  p_days INT DEFAULT 30
)
RETURNS TABLE (
  tag TEXT,
  call_count BIGINT
)
LANGUAGE sql STABLE AS $$
  SELECT unnest(auto_tags) AS tag, COUNT(*)::BIGINT AS call_count
  FROM public.call_logs
  WHERE organization_id = p_org_id
    AND started_at >= now() - (p_days || ' days')::INTERVAL
    AND auto_tags IS NOT NULL
    AND array_length(auto_tags, 1) > 0
  GROUP BY tag
  ORDER BY call_count DESC;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4: FEATURE FLAGS
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.feature_flags (key, name, description, is_core) VALUES
  ('crm_integration',  'CRM-Integration',   'Anbindung an externe CRM-Systeme (HubSpot, Pipedrive, etc.)', FALSE),
  ('erp_integration',  'ERP-Integration',   'Anbindung an externe ERP-Systeme (lexoffice, sevDesk, DATEV, etc.)', FALSE),
  ('kpi_dashboard',    'KPI-Dashboard',     'ROI-Tracking und Einsparungsberechnung pro Feature', FALSE),
  ('webhook_connector','Webhook-Connector', 'Generischer Webhook-Connector fuer Zapier/Make/n8n', FALSE)
ON CONFLICT (key) DO NOTHING;

-- Premium: add new features
INSERT INTO public.plan_tier_features (plan_id, feature_key) VALUES
  ('premium', 'kpi_dashboard'),
  ('premium', 'webhook_connector')
ON CONFLICT DO NOTHING;

-- Enterprise: all new features
INSERT INTO public.plan_tier_features (plan_id, feature_key) VALUES
  ('enterprise', 'kpi_dashboard'),
  ('enterprise', 'webhook_connector'),
  ('enterprise', 'crm_integration'),
  ('enterprise', 'erp_integration')
ON CONFLICT DO NOTHING;
