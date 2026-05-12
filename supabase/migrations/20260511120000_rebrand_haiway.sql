-- Rebrand: Time Keeper → hAIway
-- Renames the internal platform organization slug + name and updates branding metadata.
-- The org UUID stays stable; routes that key off the slug must be updated alongside
-- DEFAULT_ORGANIZATION_SLUG in Vercel + apps/web/.env.local.

UPDATE organizations
SET
  slug = 'haiway',
  name = 'hAIway',
  metadata = jsonb_set(
    COALESCE(metadata, '{}'::jsonb),
    '{branding}',
    COALESCE(metadata->'branding', '{}'::jsonb)
      || jsonb_build_object(
        'display_name', 'hAIway',
        'short_name', 'hAI'
      )
  ),
  updated_at = now()
WHERE id = '11111111-1111-1111-1111-111111111111'
  AND slug = 'time-keeper';
