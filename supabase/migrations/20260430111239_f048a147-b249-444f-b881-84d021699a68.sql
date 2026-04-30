CREATE TABLE public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  evolution_api_url text,
  evolution_api_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "us select own" ON public.user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "us insert own" ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "us update own" ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "us delete own" ON public.user_settings FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER user_settings_updated_at BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();