-- =============================================
-- FUNNELS — Sistema de Funis de Atendimento IA
-- =============================================

-- Tabela principal dos funis
CREATE TABLE IF NOT EXISTS public.funnels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  -- Prompt completo da persona/IA
  persona_prompt TEXT NOT NULL DEFAULT '',
  -- Honorários
  proposal_value NUMERIC(14,2) DEFAULT NULL,
  proposal_is_free BOOLEAN NOT NULL DEFAULT false,
  -- Mídias (URLs diretas)
  media_video_abertura   TEXT DEFAULT NULL,
  media_video_conexao    TEXT DEFAULT NULL,
  media_audio_fechamento TEXT DEFAULT NULL,
  media_video_documentos TEXT DEFAULT NULL,
  -- Template ZapSign
  zapsign_template_id TEXT DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own funnels"        ON public.funnels FOR ALL    USING (user_id = auth.uid());
CREATE POLICY "webhook read funnels"     ON public.funnels FOR SELECT USING (true);

-- Estado de cada conversa dentro de um funil
CREATE TABLE IF NOT EXISTS public.funnel_states (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id  UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  funnel_id        UUID REFERENCES public.funnels(id) ON DELETE SET NULL,
  fase             TEXT NOT NULL DEFAULT 'abertura',
  dados            JSONB NOT NULL DEFAULT '{}',
  midias_enviadas  TEXT[] NOT NULL DEFAULT '{}',
  historico        JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id)
);

ALTER TABLE public.funnel_states ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own funnel_states"    ON public.funnel_states FOR ALL    USING (user_id = auth.uid());
CREATE POLICY "webhook insert funnel_states" ON public.funnel_states FOR INSERT WITH CHECK (true);
CREATE POLICY "webhook update funnel_states" ON public.funnel_states FOR UPDATE USING (true);
CREATE POLICY "webhook select funnel_states" ON public.funnel_states FOR SELECT USING (true);
