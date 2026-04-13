-- Remove calendar event entries from sources + content_chunks.
-- Calendar events are stored in entities_calendar_events (Silver layer)
-- and should not pollute the sources/Dateien view or RAG chunks.

-- 1. Delete content_chunks that belong to calendar-event sources
DELETE FROM content_chunks
WHERE source_id IN (
  SELECT id FROM sources
  WHERE source_type = 'entity'
    AND metadata->>'entity_type' = 'calendar_event'
);

-- 2. Hard-delete the calendar-event source rows themselves
DELETE FROM sources
WHERE source_type = 'entity'
  AND metadata->>'entity_type' = 'calendar_event';
