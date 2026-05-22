-- Harden RLS policies and private WhatsApp media storage.

-- Remove anonymous webhook policies. Server-side webhook handlers must use the
-- service role client, which bypasses RLS without exposing rows to anon users.
DROP POLICY IF EXISTS "webhook read funnels" ON public.funnels;
DROP POLICY IF EXISTS "webhook appointments" ON public.appointments;
DROP POLICY IF EXISTS "webhook select funnel_states" ON public.funnel_states;
DROP POLICY IF EXISTS "webhook insert funnel_states" ON public.funnel_states;
DROP POLICY IF EXISTS "webhook update funnel_states" ON public.funnel_states;
DROP POLICY IF EXISTS "webhook insert documents" ON public.client_documents;
DROP POLICY IF EXISTS "webhook select documents" ON public.client_documents;
DROP POLICY IF EXISTS "webhook insert ai states" ON public.ai_conversation_states;
DROP POLICY IF EXISTS "webhook update ai states" ON public.ai_conversation_states;
DROP POLICY IF EXISTS "webhook_insert_conversations" ON public.conversations;
DROP POLICY IF EXISTS "webhook_update_conversations" ON public.conversations;
DROP POLICY IF EXISTS "webhook_insert_messages" ON public.messages;
DROP POLICY IF EXISTS "webhook_update_instances" ON public.whatsapp_instances;
DROP POLICY IF EXISTS "webhook_insert_executions" ON public.workflow_executions;
DROP POLICY IF EXISTS "webhook_update_executions" ON public.workflow_executions;
DROP POLICY IF EXISTS "webhook_insert_qualifications" ON public.lead_qualifications;
DROP POLICY IF EXISTS "webhook_insert_proposals" ON public.proposals;
DROP POLICY IF EXISTS "webhook_insert_contracts" ON public.contracts;
DROP POLICY IF EXISTS "webhook followups" ON public.funnel_followups;
DROP POLICY IF EXISTS "webhook locks" ON public.conversation_locks;
DROP POLICY IF EXISTS "users own ab_metrics" ON public.funnel_ab_metrics;

-- Make owner policies explicit for writes as well as reads.
DROP POLICY IF EXISTS "users own funnels" ON public.funnels;
CREATE POLICY "users select own funnels"
  ON public.funnels FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY "users insert own funnels"
  ON public.funnels FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "users update own funnels"
  ON public.funnels FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "users delete own funnels"
  ON public.funnels FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users own funnel_states" ON public.funnel_states;
CREATE POLICY "users select own funnel_states"
  ON public.funnel_states FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY "users insert own funnel_states"
  ON public.funnel_states FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "users update own funnel_states"
  ON public.funnel_states FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "users delete own funnel_states"
  ON public.funnel_states FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "users own appointments" ON public.appointments;
CREATE POLICY "users select own appointments"
  ON public.appointments FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);
CREATE POLICY "users insert own appointments"
  ON public.appointments FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "users update own appointments"
  ON public.appointments FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "users delete own appointments"
  ON public.appointments FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

CREATE POLICY "users select own ab_metrics"
  ON public.funnel_ab_metrics FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.funnels f
      WHERE f.id = funnel_id
        AND f.user_id = (select auth.uid())
    )
  );

CREATE POLICY "users insert own ab_metrics"
  ON public.funnel_ab_metrics FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.funnels f
      WHERE f.id = funnel_id
        AND f.user_id = (select auth.uid())
    )
  );

-- Private WhatsApp media bucket. App clients upload under their own user-id
-- prefix; reads are served by /api/media-proxy with short-lived signed URLs.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'image/jpeg','image/png','image/webp','image/gif',
      'audio/ogg','audio/mpeg','audio/mp4','audio/webm','audio/opus',
      'video/mp4','video/webm','video/mpeg',
      'application/pdf','application/octet-stream'
    ]
WHERE id = 'whatsapp-media';

DROP POLICY IF EXISTS "public read whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "service upload whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "service update whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "authenticated read own whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "authenticated upload own whatsapp-media" ON storage.objects;
DROP POLICY IF EXISTS "authenticated update own whatsapp-media" ON storage.objects;

CREATE POLICY "authenticated read own whatsapp-media"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "authenticated upload own whatsapp-media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

CREATE POLICY "authenticated update own whatsapp-media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'whatsapp-media'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Realtime private-channel authorization. Topics are scoped as:
--   user:<uid>:...
--   conversation:<conversation_id>
-- This prevents authenticated users from subscribing to another account's
-- conversation/message/funnel channels.
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read own realtime topics" ON realtime.messages;
DROP POLICY IF EXISTS "users can write own realtime topics" ON realtime.messages;

CREATE POLICY "users can read own realtime topics"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    (select realtime.topic()) LIKE ('user:' || (select auth.uid())::text || ':%')
    OR CASE
      WHEN (select realtime.topic()) LIKE 'conversation:%'
       AND split_part((select realtime.topic()), ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id = split_part((select realtime.topic()), ':', 2)::uuid
          AND c.user_id = (select auth.uid())
      )
      ELSE false
    END
  );

CREATE POLICY "users can write own realtime topics"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (
    (select realtime.topic()) LIKE ('user:' || (select auth.uid())::text || ':%')
    OR CASE
      WHEN (select realtime.topic()) LIKE 'conversation:%'
       AND split_part((select realtime.topic()), ':', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id = split_part((select realtime.topic()), ':', 2)::uuid
          AND c.user_id = (select auth.uid())
      )
      ELSE false
    END
  );

-- SECURITY DEFINER functions are trigger-only/internal. Block direct API calls.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_kanban_stages() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_new_user_create_workflows() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.seed_default_workflows(uuid) FROM PUBLIC, anon, authenticated;

-- Move relocatable extensions out of public when supported by the extension.
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    ALTER EXTENSION pg_cron SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not move pg_cron extension: %', SQLERRM;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    ALTER EXTENSION pg_net SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not move pg_net extension: %', SQLERRM;
END $$;
