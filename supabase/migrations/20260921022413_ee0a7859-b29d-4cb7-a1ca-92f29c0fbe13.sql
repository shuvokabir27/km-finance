CREATE TABLE public.channel_partner_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.channel_partners(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (partner_id, member_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_partner_members TO authenticated;
GRANT ALL ON public.channel_partner_members TO service_role;

ALTER TABLE public.channel_partner_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own channel partner members" ON public.channel_partner_members
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX idx_channel_partner_members_partner ON public.channel_partner_members(partner_id);
CREATE INDEX idx_channel_partner_members_member ON public.channel_partner_members(member_id);

INSERT INTO public.channel_partner_members (owner_id, partner_id, member_id)
SELECT owner_id, id, member_id FROM public.channel_partners WHERE member_id IS NOT NULL
ON CONFLICT DO NOTHING;