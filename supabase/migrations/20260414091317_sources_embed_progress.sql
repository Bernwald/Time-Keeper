-- Multi-sheet xlsx files enqueue one embed message per sheet/part. Without
-- a progress counter the worker flips status='ready' after each individual
-- message — so the UI shows "Bereit" while the pipeline still DELETEs and
-- INSERTs chunks for later sheets, causing the displayed chunk count to
-- oscillate (400 -> 360 -> 500) between refreshes.
--
-- Track how many embed jobs were enqueued (total) and how many have been
-- processed (done). Status flips to 'ready' only when done >= total.

ALTER TABLE public.sources
  ADD COLUMN IF NOT EXISTS embed_jobs_total INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS embed_jobs_done  INTEGER NOT NULL DEFAULT 0;

-- Atomic increment RPC used by worker-embed. Returns the new counters plus
-- a convenience flag so the worker can decide whether to flip status.
CREATE OR REPLACE FUNCTION public.increment_embed_progress(p_source_id UUID)
RETURNS TABLE(done INTEGER, total INTEGER, is_complete BOOLEAN)
LANGUAGE sql AS $$
  UPDATE public.sources
     SET embed_jobs_done = embed_jobs_done + 1
   WHERE id = p_source_id
  RETURNING embed_jobs_done,
           embed_jobs_total,
           (embed_jobs_done >= embed_jobs_total) AS is_complete;
$$;
