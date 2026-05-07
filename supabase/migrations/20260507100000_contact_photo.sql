-- Adicionar foto do contato na conversa
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS photo_url TEXT DEFAULT NULL;
