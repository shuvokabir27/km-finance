ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS share_token text,
  ADD COLUMN IF NOT EXISTS share_enabled boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS members_share_token_key ON public.members (share_token) WHERE share_token IS NOT NULL;