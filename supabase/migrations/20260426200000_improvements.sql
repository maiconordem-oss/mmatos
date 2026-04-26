-- Configurações do funil: horário, follow-up, notificação
ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS working_hours_start  TIME DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS working_hours_end    TIME DEFAULT '22:00',
  ADD COLUMN IF NOT EXISTS working_days         INT[] DEFAULT '{1,2,3,4,5,6}',
  ADD COLUMN IF NOT EXISTS outside_hours_msg    TEXT DEFAULT 'Olá! Recebemos sua mensagem. O Dr. Maicon retorna em breve no horário de atendimento.',
  ADD COLUMN IF NOT EXISTS followup_hours       INT DEFAULT 3,
  ADD COLUMN IF NOT EXISTS followup_msg         TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notify_phone         TEXT DEFAULT NULL;

-- Fila de follow-ups pendentes
CREATE TABLE IF NOT EXISTS public.funnel_followups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  funnel_id       UUID REFERENCES public.funnels(id) ON DELETE CASCADE,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  sent            BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, sent)
);

ALTER TABLE public.funnel_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own followups" ON public.funnel_followups FOR ALL USING (user_id = auth.uid());
CREATE POLICY "webhook followups"   ON public.funnel_followups FOR ALL USING (true);

-- ai_handled em conversations para pausar IA
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ai_paused BOOLEAN NOT NULL DEFAULT false;
