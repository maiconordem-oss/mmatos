CREATE TABLE IF NOT EXISTS public.instagram_lead_magnets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  keyword TEXT,
  description TEXT,
  button_label TEXT NOT NULL DEFAULT 'Receber no WhatsApp',
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT NOT NULL DEFAULT 'document',
  delivery_message TEXT NOT NULL DEFAULT 'Oi! Conforme combinado, segue o material que voce pediu.',
  success_message TEXT NOT NULL DEFAULT 'Pronto. Enviamos o material no seu WhatsApp.',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.instagram_lead_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  magnet_id UUID NOT NULL REFERENCES public.instagram_lead_magnets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'instagram',
  keyword TEXT,
  manychat_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.instagram_lead_magnets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_lead_submissions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_instagram_lead_magnets_user ON public.instagram_lead_magnets(user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_lead_magnets_slug ON public.instagram_lead_magnets(slug);
CREATE INDEX IF NOT EXISTS idx_instagram_lead_submissions_magnet ON public.instagram_lead_submissions(magnet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_instagram_lead_submissions_user ON public.instagram_lead_submissions(user_id, created_at DESC);

CREATE POLICY "users select own instagram lead magnets"
  ON public.instagram_lead_magnets FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users insert own instagram lead magnets"
  ON public.instagram_lead_magnets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own instagram lead magnets"
  ON public.instagram_lead_magnets FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "users delete own instagram lead magnets"
  ON public.instagram_lead_magnets FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "users select own instagram lead submissions"
  ON public.instagram_lead_submissions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users update own instagram lead submissions"
  ON public.instagram_lead_submissions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE TRIGGER instagram_lead_magnets_updated_at
  BEFORE UPDATE ON public.instagram_lead_magnets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
