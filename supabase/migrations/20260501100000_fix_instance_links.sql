-- Vincular conversas antigas às instâncias do mesmo usuário
-- Estratégia: cada conversa vai para a única instância do usuário,
-- ou para a instância padrão (is_default=true ou a primeira ativa)

-- Para usuários com apenas 1 instância de funil: vincular todas
UPDATE public.conversations c
SET instance_id = (
  SELECT wi.id
  FROM public.whatsapp_instances wi
  WHERE wi.user_id = c.user_id
    AND wi.is_office = false
    AND wi.api_url IS NOT NULL
  ORDER BY wi.created_at ASC
  LIMIT 1
)
WHERE c.instance_id IS NULL
  AND c.phone NOT LIKE 'SIM_%'
  AND (
    SELECT COUNT(*)
    FROM public.whatsapp_instances wi
    WHERE wi.user_id = c.user_id
      AND wi.is_office = false
      AND wi.api_url IS NOT NULL
  ) >= 1;

-- Índice para performance
CREATE INDEX IF NOT EXISTS idx_conversations_instance_id
  ON public.conversations(instance_id)
  WHERE instance_id IS NOT NULL;
