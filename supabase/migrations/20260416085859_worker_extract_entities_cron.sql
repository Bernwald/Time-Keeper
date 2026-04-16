-- Cron job draining the `extract` queue every 30 seconds.
-- Worker reads up to 3 messages/invocation, so total throughput is
-- ~6 extractions/minute — enough to drain 66 sources in ~11 min.

SELECT cron.schedule(
  'worker-extract-entities-30s',
  '30 seconds',
  $$SELECT public.invoke_edge_function('worker-extract-entities', '{}'::jsonb);$$
);
