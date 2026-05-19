
-- 1. Mensagens agendadas
CREATE TABLE public.scheduled_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  content TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | sent | failed | cancelled
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own scheduled select" ON public.scheduled_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own scheduled insert" ON public.scheduled_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own scheduled update" ON public.scheduled_messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own scheduled delete" ON public.scheduled_messages FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_scheduled_pending ON public.scheduled_messages (status, scheduled_at) WHERE status = 'pending';
CREATE INDEX idx_scheduled_user ON public.scheduled_messages (user_id, scheduled_at DESC);
CREATE TRIGGER trg_scheduled_messages_updated BEFORE UPDATE ON public.scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Notas internas
CREATE TABLE public.internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  author_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.internal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notes select" ON public.internal_notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own notes insert" ON public.internal_notes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own notes update" ON public.internal_notes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own notes delete" ON public.internal_notes FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_internal_notes_conv ON public.internal_notes (conversation_id, created_at DESC);

-- 3. Base de conhecimento
CREATE TABLE public.kb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.kb_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own kb select" ON public.kb_documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own kb insert" ON public.kb_documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own kb update" ON public.kb_documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own kb delete" ON public.kb_documents FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_kb_user_active ON public.kb_documents (user_id, active);
CREATE INDEX idx_kb_fts ON public.kb_documents USING gin (to_tsvector('portuguese', coalesce(title,'') || ' ' || coalesce(content,'')));
CREATE TRIGGER trg_kb_updated BEFORE UPDATE ON public.kb_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Memória do cliente
CREATE TABLE public.client_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  client_id UUID,
  conversation_id UUID,
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.client_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own memory select" ON public.client_memory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own memory insert" ON public.client_memory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own memory update" ON public.client_memory FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own memory delete" ON public.client_memory FOR DELETE USING (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_client_memory_client ON public.client_memory (user_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_client_memory_conv ON public.client_memory (conversation_id);
CREATE TRIGGER trg_client_memory_updated BEFORE UPDATE ON public.client_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Resumos de conversa
CREATE TABLE public.conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  next_step TEXT,
  legal_area TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.conversation_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own summary select" ON public.conversation_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own summary insert" ON public.conversation_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own summary update" ON public.conversation_summaries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own summary delete" ON public.conversation_summaries FOR DELETE USING (auth.uid() = user_id);

-- 6. Sentimento na conversa
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS sentiment TEXT,
  ADD COLUMN IF NOT EXISTS priority_flag TEXT;
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON public.conversations (user_id, priority_flag) WHERE priority_flag IS NOT NULL;
