-- Debounce: lock por conversa para evitar processamento paralelo
CREATE TABLE IF NOT EXISTS public.conversation_locks (
  conversation_id UUID PRIMARY KEY REFERENCES public.conversations(id) ON DELETE CASCADE,
  locked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 seconds')
);
ALTER TABLE public.conversation_locks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "webhook locks" ON public.conversation_locks FOR ALL USING (true);

-- Score de qualidade do lead
ALTER TABLE public.funnel_states
  ADD COLUMN IF NOT EXISTS lead_score    INT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS lead_tags     TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS retry_count   INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error    TEXT DEFAULT NULL;

-- A/B testing de prompts
ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS prompt_b        TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ab_enabled      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ab_split        INT NOT NULL DEFAULT 50;

-- Rastrear qual variante cada conversa usa
ALTER TABLE public.funnel_states
  ADD COLUMN IF NOT EXISTS prompt_variant  TEXT DEFAULT 'a';

-- Métricas de conversão por variante
CREATE TABLE IF NOT EXISTS public.funnel_ab_metrics (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id   UUID REFERENCES public.funnels(id) ON DELETE CASCADE,
  variant     TEXT NOT NULL DEFAULT 'a',
  event       TEXT NOT NULL, -- 'lead','qualificado','contrato','agendamento'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.funnel_ab_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own ab_metrics" ON public.funnel_ab_metrics FOR ALL USING (true);

-- Versionamento de prompts
CREATE TABLE IF NOT EXISTS public.funnel_prompt_versions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id   UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version     INT NOT NULL DEFAULT 1,
  prompt      TEXT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.funnel_prompt_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own prompt_versions" ON public.funnel_prompt_versions
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "webhook read versions" ON public.funnel_prompt_versions
  FOR SELECT USING (true);
