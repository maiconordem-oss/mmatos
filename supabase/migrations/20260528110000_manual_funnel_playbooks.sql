ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS manual_playbook JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.funnel_states
  ADD COLUMN IF NOT EXISTS manual_progress JSONB NOT NULL DEFAULT '{}'::jsonb;
