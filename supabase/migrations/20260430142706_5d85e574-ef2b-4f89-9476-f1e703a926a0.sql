ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS working_hours_start text,
  ADD COLUMN IF NOT EXISTS working_hours_end text,
  ADD COLUMN IF NOT EXISTS working_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6],
  ADD COLUMN IF NOT EXISTS outside_hours_msg text,
  ADD COLUMN IF NOT EXISTS followup_hours integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS followup_msg text,
  ADD COLUMN IF NOT EXISTS notify_phone text,
  ADD COLUMN IF NOT EXISTS group_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_participants text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS group_name_template text,
  ADD COLUMN IF NOT EXISTS group_welcome_msg text,
  ADD COLUMN IF NOT EXISTS ab_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prompt_b text,
  ADD COLUMN IF NOT EXISTS ab_split integer NOT NULL DEFAULT 50;

ALTER TABLE public.funnel_states
  ADD COLUMN IF NOT EXISTS lead_score integer,
  ADD COLUMN IF NOT EXISTS prompt_variant text;

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS ai_paused boolean NOT NULL DEFAULT false;

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_type text,
  ADD COLUMN IF NOT EXISTS media_mime text;

CREATE TABLE IF NOT EXISTS public.client_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid,
  conversation_id uuid,
  doc_type text NOT NULL DEFAULT 'outro',
  label text,
  file_url text NOT NULL,
  media_type text,
  whatsapp_media_id text,
  transcription text,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own client documents" ON public.client_documents;
DROP POLICY IF EXISTS "Users insert own client documents" ON public.client_documents;
DROP POLICY IF EXISTS "Users update own client documents" ON public.client_documents;
DROP POLICY IF EXISTS "Users delete own client documents" ON public.client_documents;

CREATE POLICY "Users select own client documents"
ON public.client_documents
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own client documents"
ON public.client_documents
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own client documents"
ON public.client_documents
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own client documents"
ON public.client_documents
FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_client_documents_updated_at
BEFORE UPDATE ON public.client_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_client_documents_user_client ON public.client_documents(user_id, client_id);
CREATE INDEX IF NOT EXISTS idx_client_documents_conversation ON public.client_documents(conversation_id);

CREATE TABLE IF NOT EXISTS public.funnel_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  funnel_id uuid,
  scheduled_at timestamp with time zone NOT NULL,
  sent boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.funnel_followups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own funnel followups" ON public.funnel_followups;
DROP POLICY IF EXISTS "Users insert own funnel followups" ON public.funnel_followups;
DROP POLICY IF EXISTS "Users update own funnel followups" ON public.funnel_followups;
DROP POLICY IF EXISTS "Users delete own funnel followups" ON public.funnel_followups;

CREATE POLICY "Users select own funnel followups"
ON public.funnel_followups
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own funnel followups"
ON public.funnel_followups
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own funnel followups"
ON public.funnel_followups
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own funnel followups"
ON public.funnel_followups
FOR DELETE
USING (auth.uid() = user_id);

CREATE TRIGGER update_funnel_followups_updated_at
BEFORE UPDATE ON public.funnel_followups
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_funnel_followups_due ON public.funnel_followups(sent, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_funnel_followups_user_conv ON public.funnel_followups(user_id, conversation_id);

CREATE TABLE IF NOT EXISTS public.funnel_ab_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  funnel_id uuid,
  conversation_id uuid,
  variant text NOT NULL DEFAULT 'a',
  event text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.funnel_ab_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users select own funnel ab events" ON public.funnel_ab_events;
DROP POLICY IF EXISTS "Users insert own funnel ab events" ON public.funnel_ab_events;
DROP POLICY IF EXISTS "Users update own funnel ab events" ON public.funnel_ab_events;
DROP POLICY IF EXISTS "Users delete own funnel ab events" ON public.funnel_ab_events;

CREATE POLICY "Users select own funnel ab events"
ON public.funnel_ab_events
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own funnel ab events"
ON public.funnel_ab_events
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own funnel ab events"
ON public.funnel_ab_events
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own funnel ab events"
ON public.funnel_ab_events
FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_funnel_ab_events_user_funnel ON public.funnel_ab_events(user_id, funnel_id);
CREATE INDEX IF NOT EXISTS idx_funnel_ab_events_conversation ON public.funnel_ab_events(conversation_id);