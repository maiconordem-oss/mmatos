-- Adiciona campos de persona e proposta nos workflows
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS persona_prompt TEXT NOT NULL DEFAULT 'Você é o Dr. Maicon Matos, advogado inscrito na OAB/RS 136.221. Atenda o cliente com cordialidade, segurança jurídica e clareza. Fale sempre em primeira pessoa, como se fosse o próprio advogado.',
  ADD COLUMN IF NOT EXISTS proposal_value NUMERIC(14,2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS proposal_is_free BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS video_url TEXT DEFAULT NULL;
