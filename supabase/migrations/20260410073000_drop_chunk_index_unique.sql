-- Multi-sheet xlsx files share a single source_id. Each sheet's chunks start
-- at chunk_index=0, which violates the old UNIQUE(source_id, chunk_index).
-- Drop it — chunk identity comes from the id PK; chunk_index is ordering only.

ALTER TABLE content_chunks
  DROP CONSTRAINT IF EXISTS content_chunks_source_id_chunk_index_key;
