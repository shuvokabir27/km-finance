CREATE TYPE public.account_kind AS ENUM ('bkash', 'nagad', 'rocket', 'upay', 'bank');

CREATE TABLE public.member_accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  member_id UUID NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  kind public.account_kind NOT NULL,
  bank_name TEXT,
  branch TEXT,
  account_holder TEXT,
  account_number TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_accounts TO authenticated;
GRANT ALL ON public.member_accounts TO service_role;

ALTER TABLE public.member_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own member accounts" ON public.member_accounts
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE INDEX idx_member_accounts_member ON public.member_accounts(member_id);