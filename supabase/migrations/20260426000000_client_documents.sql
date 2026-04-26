-- Documentos dos clientes (RG, CPF, certidão, comprovante, etc.)
CREATE TABLE IF NOT EXISTS public.client_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id    UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  doc_type     TEXT NOT NULL DEFAULT 'outro',
  -- 'rg' | 'cpf' | 'certidao_nascimento' | 'comprovante_residencia' | 'protocolo' | 'prescricao' | 'outro'
  label        TEXT,          -- nome amigável ex: "RG frente"
  file_url     TEXT NOT NULL, -- URL do arquivo no storage ou link externo
  media_type   TEXT,          -- 'image' | 'pdf' | 'audio' | 'video' | 'document'
  whatsapp_media_id TEXT,     -- ID da mídia no WhatsApp para download
  transcription TEXT,         -- transcrição do áudio (via IA)
  notes        TEXT,          -- notas manuais
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own client_documents"   ON public.client_documents FOR ALL    USING (user_id = auth.uid());
CREATE POLICY "webhook insert documents"     ON public.client_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "webhook select documents"     ON public.client_documents FOR SELECT USING (true);

-- Adicionar coluna media_url em messages se não existir
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url  TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_mime TEXT;
