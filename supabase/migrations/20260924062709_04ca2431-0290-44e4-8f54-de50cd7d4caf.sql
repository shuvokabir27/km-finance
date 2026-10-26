CREATE TABLE public.shared_channel_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  shooting_id uuid REFERENCES public.shootings(id) ON DELETE SET NULL,
  date_from date,
  date_to date,
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(18), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_channel_reports TO authenticated;
GRANT ALL ON public.shared_channel_reports TO service_role;
ALTER TABLE public.shared_channel_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own shared channel reports" ON public.shared_channel_reports FOR ALL TO authenticated
USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());