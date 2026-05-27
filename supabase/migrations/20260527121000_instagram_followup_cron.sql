CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  job_id BIGINT;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'instagram-landing-followup';
  IF job_id IS NOT NULL THEN
    PERFORM cron.unschedule(job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'instagram-landing-followup',
  '*/15 * * * *',
  $$
  SELECT net.http_get(
    url := 'https://mmatos.lovable.app/api/public/instagram-followup-tick',
    headers := jsonb_build_object('x-cron-secret', current_setting('app.settings.cron_secret', true))
  ) AS request_id;
  $$
);
