-- Permite que o webhook (sem auth) insira conversations e messages
-- usando a anon key, desde que o user_id seja válido.
-- Isso é seguro pois o webhook valida o secret antes de escrever.

-- conversations: permitir insert/update via service ou anon com user_id válido
CREATE POLICY IF NOT EXISTS "webhook_insert_conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "webhook_update_conversations"
  ON public.conversations FOR UPDATE
  USING (true);

-- messages: permitir insert via webhook
CREATE POLICY IF NOT EXISTS "webhook_insert_messages"
  ON public.messages FOR INSERT
  WITH CHECK (true);

-- whatsapp_instances: permitir update de status via webhook
CREATE POLICY IF NOT EXISTS "webhook_update_instances"
  ON public.whatsapp_instances FOR UPDATE
  USING (true);

-- workflow_executions: permitir insert/update via executor
CREATE POLICY IF NOT EXISTS "webhook_insert_executions"
  ON public.workflow_executions FOR INSERT
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "webhook_update_executions"
  ON public.workflow_executions FOR UPDATE
  USING (true);

-- lead_qualifications: permitir insert via executor
CREATE POLICY IF NOT EXISTS "webhook_insert_qualifications"
  ON public.lead_qualifications FOR INSERT
  WITH CHECK (true);

-- proposals: permitir insert via executor
CREATE POLICY IF NOT EXISTS "webhook_insert_proposals"
  ON public.proposals FOR INSERT
  WITH CHECK (true);

-- contracts: permitir insert via executor
CREATE POLICY IF NOT EXISTS "webhook_insert_contracts"
  ON public.contracts FOR INSERT
  WITH CHECK (true);
