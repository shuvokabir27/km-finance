-- Add channel column to shootings
ALTER TABLE public.shootings ADD COLUMN IF NOT EXISTS channel text;

-- Channels table (owner-scoped, used for the dropdown of existing channels)
CREATE TABLE IF NOT EXISTS public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own channels"
ON public.channels
FOR ALL
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);