ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS share_from date,
  ADD COLUMN IF NOT EXISTS share_to date;