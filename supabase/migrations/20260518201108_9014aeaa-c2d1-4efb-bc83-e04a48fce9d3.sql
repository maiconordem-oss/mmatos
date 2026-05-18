
ALTER TABLE public.ai_agent_settings
  ADD COLUMN IF NOT EXISTS qualifier_prompt_b text,
  ADD COLUMN IF NOT EXISTS ab_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_split_pct integer NOT NULL DEFAULT 50;

ALTER TABLE public.ai_debug_logs
  ADD COLUMN IF NOT EXISTS variant text;

CREATE INDEX IF NOT EXISTS ai_debug_logs_user_created_idx
  ON public.ai_debug_logs (user_id, created_at DESC);
