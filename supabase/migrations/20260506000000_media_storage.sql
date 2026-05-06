-- Bucket para mídias do WhatsApp
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media', 
  true,
  52428800, -- 50MB
  ARRAY['image/jpeg','image/png','image/webp','image/gif',
        'audio/ogg','audio/mpeg','audio/mp4','audio/webm','audio/opus',
        'video/mp4','video/webm','video/mpeg',
        'application/pdf','application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: qualquer um pode ler (bucket público)
CREATE POLICY "public read whatsapp-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'whatsapp-media');

-- Policy: service role pode fazer upload
CREATE POLICY "service upload whatsapp-media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'whatsapp-media');

CREATE POLICY "service update whatsapp-media"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'whatsapp-media');
