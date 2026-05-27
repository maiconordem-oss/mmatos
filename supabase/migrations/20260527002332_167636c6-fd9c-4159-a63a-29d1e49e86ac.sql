
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS consulta_at timestamptz,
  ADD COLUMN IF NOT EXISTS post_consulta_stage text,
  ADD COLUMN IF NOT EXISTS deadline_context text;

ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS post_consulta_d1_msg text,
  ADD COLUMN IF NOT EXISTS post_consulta_d3_msg text,
  ADD COLUMN IF NOT EXISTS post_consulta_d7_msg text;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS attended boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_d1_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_d0_sent boolean NOT NULL DEFAULT false;

ALTER TABLE public.funnel_states
  ADD COLUMN IF NOT EXISTS viability_score integer,
  ADD COLUMN IF NOT EXISTS viability_notes text;
