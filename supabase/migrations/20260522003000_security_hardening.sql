-- Harden RLS policies and private WhatsApp media storage.

-- Remove anonymous webhook policies. Server-side webhook handlers must use the
-- service role client, which bypasses RLS without exposing rows to anon users.
DO $$
DECLARE
  item record;
BEGIN
  FOR item IN
    SELECT * FROM (VALUES
      ('public.funnels', 'webhook read funnels'),
      ('public.appointments', 'webhook appointments'),
      ('public.funnel_states', 'webhook select funnel_states'),
      ('public.funnel_states', 'webhook insert funnel_states'),
      ('public.funnel_states', 'webhook update funnel_states'),
      ('public.client_documents', 'webhook insert documents'),
      ('public.client_documents', 'webhook select documents'),
      ('public.ai_conversation_states', 'webhook insert ai states'),
      ('public.ai_conversation_states', 'webhook update ai states'),
      ('public.conversations', 'webhook_insert_conversations'),
      ('public.conversations', 'webhook_update_conversations'),
      ('public.messages', 'webhook_insert_messages'),
      ('public.whatsapp_instances', 'webhook_update_instances'),
      ('public.workflow_executions', 'webhook_insert_executions'),
      ('public.workflow_executions', 'webhook_update_executions'),
      ('public.lead_qualifications', 'webhook_insert_qualifications'),
      ('public.proposals', 'webhook_insert_proposals'),
      ('public.contracts', 'webhook_insert_contracts'),
      ('public.funnel_followups', 'webhook followups'),
      ('public.conversation_locks', 'webhook locks'),
      ('public.funnel_ab_metrics', 'users own ab_metrics'),
      ('public.funnel_ab_metrics', 'users select own ab_metrics'),
      ('public.funnel_ab_metrics', 'users insert own ab_metrics')
    ) AS policies(table_name, policy_name)
  LOOP
    IF to_regclass(item.table_name) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %s', item.policy_name, item.table_name);
    END IF;
  END LOOP;
END $$;

-- Make owner policies explicit for writes as well as reads.
DROP POLICY IF EXISTS "users own funnels" ON public.funnels;
DROP POLICY IF EXISTS "users select own funnels" ON public.funnels;
DROP POLICY IF EXISTS "users insert own funnels" ON public.funnels;
DROP POLICY IF EXISTS "users update own funnels" ON public.funnels;
DROP POLICY IF EXISTS "users delete own funnels" ON public.funnels;
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
DROP POLICY IF EXISTS "users select own funnel_states" ON public.funnel_states;
DROP POLICY IF EXISTS "users insert own funnel_states" ON public.funnel_states;
DROP POLICY IF EXISTS "users update own funnel_states" ON public.funnel_states;
DROP POLICY IF EXISTS "users delete own funnel_states" ON public.funnel_states;
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
DROP POLICY IF EXISTS "users select own appointments" ON public.appointments;
DROP POLICY IF EXISTS "users insert own appointments" ON public.appointments;
DROP POLICY IF EXISTS "users update own appointments" ON public.appointments;
DROP POLICY IF EXISTS "users delete own appointments" ON public.appointments;
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

DO $$
BEGIN
  IF to_regclass('public.funnel_ab_metrics') IS NOT NULL THEN
    EXECUTE $policy$
    CREATE POLICY "users select own ab_metrics"
      ON public.funnel_ab_metrics FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.funnels f
          WHERE f.id = funnel_id
            AND f.user_id = (select auth.uid())
        )
      )
    $policy$;

    EXECUTE $policy$
    CREATE POLICY "users insert own ab_metrics"
      ON public.funnel_ab_metrics FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.funnels f
          WHERE f.id = funnel_id
            AND f.user_id = (select auth.uid())
        )
      )
    $policy$;
  END IF;
END $$;

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
DO $$
DECLARE
  func_name text;
BEGIN
  FOREACH func_name IN ARRAY ARRAY[
    'public.handle_new_user()',
    'public.seed_default_kanban_stages()',
    'public.on_new_user_create_workflows()',
    'public.seed_default_workflows(uuid)'
  ]
  LOOP
    IF to_regprocedure(func_name) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', func_name);
    END IF;
  END LOOP;
END $$;

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
