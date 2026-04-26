-- Adicionar configuração de grupo WhatsApp nos funis
ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS group_enabled     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_name_template TEXT DEFAULT 'Caso {nome} — Dr. Maicon',
  ADD COLUMN IF NOT EXISTS group_participants  TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS group_welcome_msg   TEXT DEFAULT NULL;
