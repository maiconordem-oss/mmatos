-- F1: Lembretes de consulta
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_d1_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_d0_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS attended BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS attended_at TIMESTAMPTZ DEFAULT NULL;

-- F2: Follow-up pós-consulta
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS consulta_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS post_consulta_stage TEXT DEFAULT NULL;

-- F3: Briefing jurídico (JSONB: area, urgencia, resumo_caso, fatos_principais, documentos_necessarios, gerado_em)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS briefing JSONB DEFAULT NULL;

-- F7: Deadline contextual
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS deadline_mentioned_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deadline_context TEXT DEFAULT NULL;

-- F4: Score de viabilidade no funnel_state
ALTER TABLE public.funnel_states
  ADD COLUMN IF NOT EXISTS viability_score INTEGER DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS viability_notes TEXT DEFAULT NULL;

-- F2: Mensagens pós-consulta configuráveis por funil
ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS post_consulta_d1_msg TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS post_consulta_d3_msg TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS post_consulta_d7_msg TEXT DEFAULT NULL;

-- Índices para queries frequentes dos crons
CREATE INDEX IF NOT EXISTS idx_appointments_reminders
  ON public.appointments(start_at, reminder_d1_sent, reminder_d0_sent)
  WHERE attended = false;

CREATE INDEX IF NOT EXISTS idx_conversations_consulta
  ON public.conversations(user_id, consulta_at, post_consulta_stage)
  WHERE consulta_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_deadline
  ON public.conversations(user_id, deadline_mentioned_at)
  WHERE deadline_mentioned_at IS NOT NULL;
