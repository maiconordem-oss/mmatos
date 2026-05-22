DO $$
DECLARE
  job_id BIGINT;
BEGIN
  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'cron-reminders';
  IF job_id IS NOT NULL THEN PERFORM cron.unschedule(job_id); END IF;

  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'cron-post-consulta';
  IF job_id IS NOT NULL THEN PERFORM cron.unschedule(job_id); END IF;

  SELECT jobid INTO job_id FROM cron.job WHERE jobname = 'cron-reactivation';
  IF job_id IS NOT NULL THEN PERFORM cron.unschedule(job_id); END IF;
END $$;

-- F1: Lembretes de consulta (D-1 / D-0) — a cada 30 min
SELECT cron.schedule(
  'cron-reminders',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://mmatos.lovable.app/api/public/cron-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- F2: Follow-up pós-consulta (D+1, D+3, D+7) — todo dia às 8h
SELECT cron.schedule(
  'cron-post-consulta',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mmatos.lovable.app/api/public/cron-post-consulta',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- F7: Reativação contextual de leads com prazo — todo dia às 9h
SELECT cron.schedule(
  'cron-reactivation',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mmatos.lovable.app/api/public/cron-reactivation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
