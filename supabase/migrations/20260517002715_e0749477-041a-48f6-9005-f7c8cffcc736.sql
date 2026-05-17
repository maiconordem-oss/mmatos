
-- ai_debug_logs
CREATE TABLE public.ai_debug_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  kind TEXT NOT NULL DEFAULT 'reply',
  model TEXT,
  prompt JSONB,
  response TEXT,
  latency_ms INTEGER,
  estimated_cost NUMERIC,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_debug_logs_conv ON public.ai_debug_logs(conversation_id, created_at DESC);
ALTER TABLE public.ai_debug_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ai logs select" ON public.ai_debug_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own ai logs insert" ON public.ai_debug_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own ai logs delete" ON public.ai_debug_logs FOR DELETE USING (auth.uid() = user_id);

-- forbidden_words
CREATE TABLE public.forbidden_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  word TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'high',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, word)
);
ALTER TABLE public.forbidden_words ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fw all" ON public.forbidden_words FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- conversations new columns
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS follow_up_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_human BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_consecutive_count INTEGER NOT NULL DEFAULT 0;

-- kb_documents extra columns
ALTER TABLE public.kb_documents
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS embedding_ready BOOLEAN NOT NULL DEFAULT false;
