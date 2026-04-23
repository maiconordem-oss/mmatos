-- 1. kanban_stages table
CREATE TABLE public.kanban_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  key text NOT NULL,
  label text NOT NULL,
  color text NOT NULL DEFAULT 'slate',
  position integer NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

ALTER TABLE public.kanban_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ks select own" ON public.kanban_stages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "ks insert own" ON public.kanban_stages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ks update own" ON public.kanban_stages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "ks delete own" ON public.kanban_stages FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER kanban_stages_set_updated
BEFORE UPDATE ON public.kanban_stages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Convert cases.stage from enum to text (free)
ALTER TABLE public.cases ALTER COLUMN stage DROP DEFAULT;
ALTER TABLE public.cases ALTER COLUMN stage TYPE text USING stage::text;
ALTER TABLE public.cases ALTER COLUMN stage SET DEFAULT 'lead';

-- 3. Seed default stages on user signup
CREATE OR REPLACE FUNCTION public.seed_default_kanban_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.kanban_stages (user_id, key, label, color, position, is_won, is_lost) VALUES
    (NEW.id, 'lead',          'Leads',         'slate',  0, false, false),
    (NEW.id, 'qualificacao',  'Qualificação',  'blue',   1, false, false),
    (NEW.id, 'proposta',      'Proposta',      'amber',  2, false, false),
    (NEW.id, 'em_andamento',  'Em andamento',  'violet', 3, false, false),
    (NEW.id, 'aguardando',    'Aguardando',    'orange', 4, false, false),
    (NEW.id, 'concluido',     'Concluído',     'emerald',5, true,  false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_seed_stages ON auth.users;
CREATE TRIGGER on_auth_user_created_seed_stages
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.seed_default_kanban_stages();

-- 4. Backfill stages for existing users
INSERT INTO public.kanban_stages (user_id, key, label, color, position, is_won, is_lost)
SELECT u.id, v.key, v.label, v.color, v.position, v.is_won, v.is_lost
FROM auth.users u
CROSS JOIN (VALUES
  ('lead',          'Leads',         'slate',  0, false, false),
  ('qualificacao',  'Qualificação',  'blue',   1, false, false),
  ('proposta',      'Proposta',      'amber',  2, false, false),
  ('em_andamento',  'Em andamento',  'violet', 3, false, false),
  ('aguardando',    'Aguardando',    'orange', 4, false, false),
  ('concluido',     'Concluído',     'emerald',5, true,  false)
) AS v(key, label, color, position, is_won, is_lost)
ON CONFLICT (user_id, key) DO NOTHING;
