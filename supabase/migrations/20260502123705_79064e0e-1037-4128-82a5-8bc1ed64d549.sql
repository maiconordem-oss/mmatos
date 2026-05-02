CREATE TABLE IF NOT EXISTS public.conversation_locks (
  conversation_id uuid PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 seconds')
);
ALTER TABLE public.conversation_locks ENABLE ROW LEVEL SECURITY;
-- nenhuma política: acessado apenas via service-role no servidor
CREATE INDEX IF NOT EXISTS idx_conversation_locks_expires ON public.conversation_locks (expires_at);