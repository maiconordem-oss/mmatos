ALTER TABLE public.funnels
  ALTER COLUMN followup_hours SET DEFAULT 48;

UPDATE public.funnels
SET followup_hours = 48
WHERE followup_hours IS NULL
   OR followup_hours IN (0, 3);
