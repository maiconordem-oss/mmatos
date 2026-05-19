-- Habilitar extensões necessárias (já disponíveis em todos os projetos Supabase)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remover agendamento anterior se existir (idempotente)
select cron.unschedule('workflow-tick') where exists (
  select 1 from cron.job where jobname = 'workflow-tick'
);

-- Agendar workflow-tick a cada 15 minutos
-- Executa: follow-ups, status check, conversas abandonadas, etc.
select cron.schedule(
  'workflow-tick',
  '*/15 * * * *',
  $$
  select net.http_get(
    url := 'https://mmatos.lovable.app/api/public/workflow-tick'
  ) as request_id;
  $$
);
