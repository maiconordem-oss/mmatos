-- Status de leitura nas mensagens
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ DEFAULT NULL;

-- Contato bloqueado
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS blocked     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unread_manually BOOLEAN NOT NULL DEFAULT false;

-- Index para busca de mensagens
CREATE INDEX IF NOT EXISTS idx_messages_content ON public.messages USING gin(to_tsvector('portuguese', coalesce(content, '')));
