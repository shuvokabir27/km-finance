
ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS logo_url text;

CREATE TABLE IF NOT EXISTS public.directors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.directors TO authenticated;
GRANT ALL ON public.directors TO service_role;

ALTER TABLE public.directors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their directors"
  ON public.directors FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER update_directors_updated_at
  BEFORE UPDATE ON public.directors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
