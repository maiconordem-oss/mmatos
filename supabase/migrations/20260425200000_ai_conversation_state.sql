-- Estado semântico de conversas com IA (fases, dados coletados, mídias enviadas)
CREATE TABLE IF NOT EXISTS public.ai_conversation_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  workflow_id UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
  fase TEXT NOT NULL DEFAULT 'abertura',
  dados_extraidos JSONB NOT NULL DEFAULT '{}',
  midias_enviadas TEXT[] NOT NULL DEFAULT '{}',
  historico JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id)
);

ALTER TABLE public.ai_conversation_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own their ai states" ON public.ai_conversation_states
  USING (user_id = auth.uid());
CREATE POLICY "webhook insert ai states" ON public.ai_conversation_states
  FOR INSERT WITH CHECK (true);
CREATE POLICY "webhook update ai states" ON public.ai_conversation_states
  FOR UPDATE USING (true);

-- Mídias configuráveis por workflow
CREATE TABLE IF NOT EXISTS public.workflow_medias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  media_key TEXT NOT NULL,  -- ex: "video_abertura", "audio_fechamento"
  media_type TEXT NOT NULL DEFAULT 'video', -- video | audio | image
  url TEXT,                 -- URL real (preenchida quando tiver)
  caption TEXT,
  duration_seconds INT DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(workflow_id, media_key)
);

ALTER TABLE public.workflow_medias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own medias" ON public.workflow_medias USING (user_id = auth.uid());
CREATE POLICY "webhook read medias" ON public.workflow_medias FOR SELECT USING (true);
