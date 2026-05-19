ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_pause_reason TEXT DEFAULT NULL;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS last_error TEXT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS public.conversation_assignment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversation_assignment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "assignment events select own" ON public.conversation_assignment_events;
CREATE POLICY "assignment events select own"
  ON public.conversation_assignment_events
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "assignment events insert own" ON public.conversation_assignment_events;
CREATE POLICY "assignment events insert own"
  ON public.conversation_assignment_events
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_conversations_sla_due
  ON public.conversations(user_id, sla_due_at)
  WHERE sla_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_first_response
  ON public.conversations(user_id, first_response_at)
  WHERE first_response_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignment_events_conversation
  ON public.conversation_assignment_events(conversation_id, created_at DESC);
