-- Mark the internal TimeKeeper organization as platform-owner, separate from customer orgs.
-- Admin UI filters customer lists by `is_platform = false` and renders a dedicated
-- "Mein Unternehmen" section for the platform org.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS is_platform BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.organizations
  SET is_platform = TRUE
  WHERE slug = 'time-keeper';

CREATE INDEX IF NOT EXISTS organizations_is_platform_idx
  ON public.organizations(is_platform)
  WHERE is_platform = TRUE;
