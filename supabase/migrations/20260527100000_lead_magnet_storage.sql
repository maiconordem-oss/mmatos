INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'lead-magnets',
  'lead-magnets',
  true,
  52428800,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "public read lead-magnets" ON storage.objects;
DROP POLICY IF EXISTS "authenticated upload own lead-magnets" ON storage.objects;
DROP POLICY IF EXISTS "authenticated update own lead-magnets" ON storage.objects;
DROP POLICY IF EXISTS "authenticated delete own lead-magnets" ON storage.objects;

CREATE POLICY "public read lead-magnets"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lead-magnets');

CREATE POLICY "authenticated upload own lead-magnets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lead-magnets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "authenticated update own lead-magnets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lead-magnets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "authenticated delete own lead-magnets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'lead-magnets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
