-- Configuração de agenda por funil
ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS calendar_enabled        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS calendar_google_token   TEXT DEFAULT NULL,   -- refresh_token OAuth
  ADD COLUMN IF NOT EXISTS calendar_id             TEXT DEFAULT NULL,   -- ID do calendário Google
  ADD COLUMN IF NOT EXISTS calendar_slot_duration  INT  DEFAULT 30,     -- duração em minutos
  ADD COLUMN IF NOT EXISTS calendar_start_hour     INT  DEFAULT 9,      -- hora início (9 = 9h)
  ADD COLUMN IF NOT EXISTS calendar_end_hour       INT  DEFAULT 18,     -- hora fim (18 = 18h)
  ADD COLUMN IF NOT EXISTS calendar_meeting_title  TEXT DEFAULT 'Consulta — Dr. Maicon Matos',
  ADD COLUMN IF NOT EXISTS calendar_meeting_desc   TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS handoff_enabled         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS handoff_msg             TEXT DEFAULT 'Entendido. Vou acionar minha equipe para falar diretamente com você. Aguarde um instante.';

-- Agendamentos realizados
CREATE TABLE IF NOT EXISTS public.appointments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id       UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  funnel_id       UUID REFERENCES public.funnels(id) ON DELETE SET NULL,
  google_event_id TEXT,
  title           TEXT NOT NULL,
  start_at        TIMESTAMPTZ NOT NULL,
  end_at          TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'confirmado',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own appointments" ON public.appointments FOR ALL USING (user_id = auth.uid());
CREATE POLICY "webhook appointments"   ON public.appointments FOR ALL USING (true);
