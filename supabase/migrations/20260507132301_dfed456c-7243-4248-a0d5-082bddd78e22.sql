ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS blocked boolean NOT NULL DEFAULT false;