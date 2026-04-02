-- Migration: processes
-- Process templates, instances, and analysis functions for consulting delivery

-- ─── PROCESS TEMPLATES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.process_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  category        TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.process_template_steps (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id            UUID NOT NULL REFERENCES public.process_templates(id) ON DELETE CASCADE,
  step_order             INTEGER NOT NULL,
  name                   TEXT NOT NULL,
  description            TEXT,
  expected_duration_days INTEGER,
  responsible_role       TEXT,
  metadata               JSONB NOT NULL DEFAULT '{}',
  UNIQUE (template_id, step_order)
);

-- ─── PROCESS INSTANCES ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.process_instances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id     UUID NOT NULL REFERENCES public.process_templates(id),
  project_id      UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  company_id      UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.process_instance_steps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id      UUID NOT NULL REFERENCES public.process_instances(id) ON DELETE CASCADE,
  template_step_id UUID REFERENCES public.process_template_steps(id),
  step_order       INTEGER NOT NULL,
  name             TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  completed_by     UUID REFERENCES public.profiles(id),
  notes            TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}',
  UNIQUE (instance_id, step_order)
);

-- ─── INDEXES ────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_process_templates_org ON public.process_templates (organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_template_steps_template ON public.process_template_steps (template_id, step_order);
CREATE INDEX IF NOT EXISTS idx_process_instances_org ON public.process_instances (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_process_instances_project ON public.process_instances (project_id);
CREATE INDEX IF NOT EXISTS idx_process_instances_company ON public.process_instances (company_id);
CREATE INDEX IF NOT EXISTS idx_instance_steps_instance ON public.process_instance_steps (instance_id, step_order);

-- ─── TRIGGERS ───────────────────────────────────────────────────────────

CREATE TRIGGER set_updated_at_process_templates
  BEFORE UPDATE ON public.process_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_process_instances
  BEFORE UPDATE ON public.process_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────

ALTER TABLE public.process_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_template_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_instance_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "process_templates_org_all" ON public.process_templates
  FOR ALL USING (public.is_member_of_org(organization_id))
  WITH CHECK (public.is_member_of_org(organization_id));

-- Template steps: access via template's org
CREATE POLICY "process_template_steps_org_all" ON public.process_template_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.process_templates pt
      WHERE pt.id = template_id AND public.is_member_of_org(pt.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.process_templates pt
      WHERE pt.id = template_id AND public.is_member_of_org(pt.organization_id)
    )
  );

CREATE POLICY "process_instances_org_all" ON public.process_instances
  FOR ALL USING (public.is_member_of_org(organization_id))
  WITH CHECK (public.is_member_of_org(organization_id));

-- Instance steps: access via instance's org
CREATE POLICY "process_instance_steps_org_all" ON public.process_instance_steps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.process_instances pi
      WHERE pi.id = instance_id AND public.is_member_of_org(pi.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.process_instances pi
      WHERE pi.id = instance_id AND public.is_member_of_org(pi.organization_id)
    )
  );

-- ─── ANALYSIS FUNCTIONS ─────────────────────────────────────────────────

-- Soll-Ist analysis for a single process instance
CREATE OR REPLACE FUNCTION public.get_process_analysis(p_instance_id UUID)
RETURNS TABLE (
  step_name TEXT,
  step_order INTEGER,
  status TEXT,
  expected_duration_days INTEGER,
  actual_days NUMERIC,
  deviation_days NUMERIC,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT
    pis.name AS step_name,
    pis.step_order,
    pis.status,
    pts.expected_duration_days,
    CASE
      WHEN pis.started_at IS NOT NULL AND pis.completed_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (pis.completed_at - pis.started_at)) / 86400.0
      ELSE NULL
    END AS actual_days,
    CASE
      WHEN pis.started_at IS NOT NULL AND pis.completed_at IS NOT NULL AND pts.expected_duration_days IS NOT NULL
      THEN (EXTRACT(EPOCH FROM (pis.completed_at - pis.started_at)) / 86400.0) - pts.expected_duration_days
      ELSE NULL
    END AS deviation_days,
    pis.started_at,
    pis.completed_at
  FROM public.process_instance_steps pis
  LEFT JOIN public.process_template_steps pts ON pts.id = pis.template_step_id
  WHERE pis.instance_id = p_instance_id
  ORDER BY pis.step_order;
$$;

-- Aggregated template performance across all instances
CREATE OR REPLACE FUNCTION public.get_template_performance(
  p_template_id UUID,
  p_org_id      UUID
)
RETURNS TABLE (
  total_instances BIGINT,
  completed_instances BIGINT,
  completion_rate NUMERIC,
  avg_duration_days NUMERIC,
  bottleneck_step TEXT,
  bottleneck_avg_deviation NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH instance_stats AS (
    SELECT
      pi.id,
      pi.status,
      CASE
        WHEN pi.completed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (pi.completed_at - pi.started_at)) / 86400.0
        ELSE NULL
      END AS duration_days
    FROM public.process_instances pi
    WHERE pi.template_id = p_template_id
      AND pi.organization_id = p_org_id
  ),
  step_deviations AS (
    SELECT
      pis.name AS step_name,
      AVG(
        CASE
          WHEN pis.started_at IS NOT NULL AND pis.completed_at IS NOT NULL AND pts.expected_duration_days IS NOT NULL
          THEN (EXTRACT(EPOCH FROM (pis.completed_at - pis.started_at)) / 86400.0) - pts.expected_duration_days
          ELSE NULL
        END
      ) AS avg_deviation
    FROM public.process_instance_steps pis
    JOIN public.process_instances pi ON pi.id = pis.instance_id
    LEFT JOIN public.process_template_steps pts ON pts.id = pis.template_step_id
    WHERE pi.template_id = p_template_id
      AND pi.organization_id = p_org_id
    GROUP BY pis.name
    HAVING AVG(
      CASE
        WHEN pis.started_at IS NOT NULL AND pis.completed_at IS NOT NULL AND pts.expected_duration_days IS NOT NULL
        THEN (EXTRACT(EPOCH FROM (pis.completed_at - pis.started_at)) / 86400.0) - pts.expected_duration_days
        ELSE NULL
      END
    ) IS NOT NULL
  ),
  bottleneck AS (
    SELECT step_name, avg_deviation
    FROM step_deviations
    ORDER BY avg_deviation DESC
    LIMIT 1
  )
  SELECT
    COUNT(*)::BIGINT AS total_instances,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_instances,
    ROUND(
      CASE WHEN COUNT(*) > 0
        THEN (COUNT(*) FILTER (WHERE status = 'completed'))::NUMERIC / COUNT(*)::NUMERIC * 100
        ELSE 0
      END, 1
    ) AS completion_rate,
    ROUND(AVG(duration_days)::NUMERIC, 1) AS avg_duration_days,
    (SELECT step_name FROM bottleneck) AS bottleneck_step,
    (SELECT ROUND(avg_deviation::NUMERIC, 1) FROM bottleneck) AS bottleneck_avg_deviation
  FROM instance_stats;
$$;

-- Dashboard: org-wide process overview
CREATE OR REPLACE FUNCTION public.get_process_dashboard(p_org_id UUID)
RETURNS TABLE (
  active_instances BIGINT,
  completed_instances BIGINT,
  overdue_steps BIGINT,
  avg_completion_days NUMERIC
)
LANGUAGE sql STABLE AS $$
  WITH instances AS (
    SELECT pi.id, pi.status, pi.started_at, pi.completed_at
    FROM public.process_instances pi
    WHERE pi.organization_id = p_org_id
  ),
  overdue AS (
    SELECT COUNT(*)::BIGINT AS cnt
    FROM public.process_instance_steps pis
    JOIN public.process_instances pi ON pi.id = pis.instance_id
    LEFT JOIN public.process_template_steps pts ON pts.id = pis.template_step_id
    WHERE pi.organization_id = p_org_id
      AND pis.status IN ('pending', 'in_progress')
      AND pis.started_at IS NOT NULL
      AND pts.expected_duration_days IS NOT NULL
      AND pis.started_at + (pts.expected_duration_days || ' days')::INTERVAL < NOW()
  )
  SELECT
    COUNT(*) FILTER (WHERE status = 'active')::BIGINT AS active_instances,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_instances,
    (SELECT cnt FROM overdue) AS overdue_steps,
    ROUND(
      AVG(
        CASE WHEN completed_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (completed_at - started_at)) / 86400.0
          ELSE NULL
        END
      )::NUMERIC, 1
    ) AS avg_completion_days
  FROM instances;
$$;

-- ─── FEATURE FLAG ───────────────────────────────────────────────────────

INSERT INTO public.feature_flags (key, name, description, is_core) VALUES
  ('process_management', 'Prozesse', 'Prozess-Templates und Analyse-Dashboards', FALSE)
ON CONFLICT (key) DO NOTHING;
