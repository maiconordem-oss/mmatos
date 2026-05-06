-- ── Filas de atendimento ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.queues (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL DEFAULT '#3b82f6',
  greetingMsg TEXT DEFAULT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.queues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own queues" ON public.queues FOR ALL USING (user_id = auth.uid());

-- ── Status do ticket na conversa ─────────────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ticket_status  TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS accepted_at    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS resolved_at    TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS queue_id       UUID REFERENCES public.queues(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_to    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tags           TEXT[] NOT NULL DEFAULT '{}';

-- ── Respostas rápidas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quick_replies (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shortcut   TEXT NOT NULL,      -- ex: "bom_dia"
  message    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, shortcut)
);
ALTER TABLE public.quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own quick_replies" ON public.quick_replies FOR ALL USING (user_id = auth.uid());

-- ── Tags de conversa ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_tags (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name    TEXT NOT NULL,
  color   TEXT NOT NULL DEFAULT '#6366f1',
  UNIQUE(user_id, name)
);
ALTER TABLE public.conversation_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own tags" ON public.conversation_tags FOR ALL USING (user_id = auth.uid());

-- ── Horário de atendimento ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_hours (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled         BOOLEAN NOT NULL DEFAULT false,
  start_hour      INT NOT NULL DEFAULT 9,
  end_hour        INT NOT NULL DEFAULT 18,
  work_days       INT[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 0=Dom,6=Sab
  absent_message  TEXT NOT NULL DEFAULT 'Nosso atendimento é de segunda a sexta das 9h às 18h. Em breve retornaremos!',
  away_timeout_min INT NOT NULL DEFAULT 5,
  away_message    TEXT NOT NULL DEFAULT 'Aguarde, em breve um atendente irá te responder.',
  UNIQUE(user_id)
);
ALTER TABLE public.business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own business_hours" ON public.business_hours FOR ALL USING (user_id = auth.uid());

-- Indexes
CREATE INDEX IF NOT EXISTS idx_conversations_ticket_status ON public.conversations(ticket_status);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to   ON public.conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_conversations_tags          ON public.conversations USING gin(tags);

-- Quick replies padrão
INSERT INTO public.quick_replies (user_id, shortcut, message)
SELECT 
  u.id,
  sr.shortcut,
  sr.message
FROM auth.users u
CROSS JOIN (VALUES
  ('bom_dia',   'Bom dia! Como posso ajudar?'),
  ('boa_tarde', 'Boa tarde! Como posso ajudar?'),
  ('aguarde',   'Aguarde um momento, já verifico.'),
  ('obrigado',  'Obrigado pelo contato! Qualquer dúvida estou à disposição.'),
  ('encerrar',  'Encerrando o atendimento. Qualquer dúvida é só chamar!')
) AS sr(shortcut, message)
ON CONFLICT (user_id, shortcut) DO NOTHING;
