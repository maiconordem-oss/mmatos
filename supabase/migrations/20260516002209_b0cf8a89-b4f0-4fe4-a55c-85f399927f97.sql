
-- Habilita extensões caso ainda não existam
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior (idempotente)
DO $$
DECLARE
  job_id BIGINT;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'lex_cron_scheduled_messages';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'lex_cron_scheduled_messages',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--c2df6385-2cdf-486c-88ee-d00948ec7a3c.lovable.app/api/public/cron-scheduled',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
