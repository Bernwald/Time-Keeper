-- Migration: worker_embed_cron
-- Schedules the Silver→Gold embedding worker to drain the `embed` queue.

SELECT cron.schedule(
  'worker-embed-30s',
  '30 seconds',
  $$ SELECT public.invoke_edge_function('worker-embed', '{}'::jsonb) $$
);
