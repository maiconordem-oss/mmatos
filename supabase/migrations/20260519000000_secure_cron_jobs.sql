CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  job_id BIGINT;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'workflow-tick';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;

  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'lex_cron_scheduled_messages';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'workflow-tick',
  '*/15 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://mmatos.lovable.app/api/public/workflow-tick',
    headers := jsonb_build_object('x-cron-secret', current_setting('app.settings.cron_secret', true))
  ) AS request_id;
  $$
);

SELECT cron.schedule(
  'lex_cron_scheduled_messages',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mmatos.lovable.app/api/public/cron-scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
