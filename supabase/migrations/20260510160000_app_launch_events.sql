-- App-Launch-Telemetrie für das HAIway-interne App-Inventar.
--
-- Wer hat wann welche App gelauncht? Speist die Mission-Control-Sektion
-- "Apps zuletzt genutzt" + "Top-Apps" und liefert Daten für die
-- kaufen-vs-bauen-Entscheidung (siehe project_haiway_internal_app_marketplace).
--
-- Eine App ist via app_id identifiziert (Stub heute hardcoded; später
-- GitHub-Repo-Slug oder eigene apps-Tabelle). app_kind hilft beim Sortieren
-- (no-code vs typescript vs external).

CREATE TABLE IF NOT EXISTS public.app_launch_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  app_id          TEXT NOT NULL,
  app_kind        TEXT NOT NULL CHECK (app_kind IN ('no-code', 'typescript', 'external')),
  metadata        JSONB NOT NULL DEFAULT '{}',
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_launch_events_org_time
  ON public.app_launch_events (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS app_launch_events_app_time
  ON public.app_launch_events (app_id, occurred_at DESC);

ALTER TABLE public.app_launch_events ENABLE ROW LEVEL SECURITY;

-- Lesen: nur Platform-Admins (HAIway-intern). Spätere interne Rollen
-- (CEO/Berater/Operative) feilen das aus, bis dahin reicht is_platform_admin.
DROP POLICY IF EXISTS "app_launch_events_select" ON public.app_launch_events;
CREATE POLICY "app_launch_events_select"
  ON public.app_launch_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.is_platform_admin = TRUE
    )
  );

-- Insert: jeder authentifizierte User der Plattform-Org darf seine eigenen
-- Launches loggen. user_id muss = auth.uid() sein.
DROP POLICY IF EXISTS "app_launch_events_insert" ON public.app_launch_events;
CREATE POLICY "app_launch_events_insert"
  ON public.app_launch_events
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND public.is_member_of_org(organization_id)
  );
