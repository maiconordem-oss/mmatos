-- Substituir colunas fixas de mídia por JSONB livre
ALTER TABLE public.funnels
  ADD COLUMN IF NOT EXISTS medias JSONB NOT NULL DEFAULT '{}';

-- Migrar dados existentes para o novo campo
UPDATE public.funnels SET medias = (
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'video_abertura',   media_video_abertura,
    'video_conexao',    media_video_conexao,
    'audio_fechamento', media_audio_fechamento,
    'video_documentos', media_video_documentos
  ))
);
