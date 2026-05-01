-- Vincular conversa à instância que a recebeu
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_instance ON public.conversations(instance_id);

-- Número do escritório (recebe notificações de todos os funis)
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS is_office   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS office_role TEXT DEFAULT NULL;
-- office_role: 'notifications' = recebe avisos de todos os funis
