-- Migration: drop_manual_tags
--
-- Removes the manual tag system entirely. The user-pflegt-Tags model
-- contradicted the platform thesis (data sources connect → it just works);
-- the admin UI was already unlinked from the navigation, the entity-tag
-- attachment UI (TagManager) was never wired up, and the tag-driven
-- retrieval branches in chat always returned empty results in practice.
--
-- If tag-based retrieval ever returns, it should be auto-derived in the
-- silver layer (read-only for the customer) — not a manual maintenance
-- surface. See conversation 2026-05-10.

-- Drop RPC functions first (they depend on the tables)
DROP FUNCTION IF EXISTS public.list_entities_by_tag(uuid, uuid[], text[], int);
DROP FUNCTION IF EXISTS public.get_entities_by_tag(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.get_tags_for_entity(text, uuid);

-- Drop tables (entity_tags first — it FKs into tags)
DROP TABLE IF EXISTS public.entity_tags CASCADE;
DROP TABLE IF EXISTS public.tags CASCADE;
