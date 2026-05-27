ALTER TABLE public.instagram_lead_magnets
  ADD COLUMN IF NOT EXISTS followup_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS followup_hours INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS followup_message TEXT NOT NULL DEFAULT 'Oi, {{nome}}! Passando para saber se voce conseguiu ver o material que enviei. Ainda posso te ajudar com alguma duvida?';

ALTER TABLE public.instagram_lead_submissions
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_message_id TEXT,
  ADD COLUMN IF NOT EXISTS followup_scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_error TEXT;

CREATE INDEX IF NOT EXISTS idx_instagram_lead_submissions_followup
  ON public.instagram_lead_submissions(followup_status, followup_scheduled_at)
  WHERE followup_scheduled_at IS NOT NULL;

UPDATE public.instagram_lead_submissions
SET followup_status = 'disabled'
WHERE followup_scheduled_at IS NULL
  AND followup_status = 'pending';
