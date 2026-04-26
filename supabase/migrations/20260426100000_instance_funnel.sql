-- Vincular instância WhatsApp ao seu funil
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES public.funnels(id) ON DELETE SET NULL;
