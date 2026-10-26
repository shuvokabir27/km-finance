CREATE TABLE public.admin_credentials (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  mobile text NOT NULL UNIQUE,
  pin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mobile_11_digits CHECK (mobile ~ '^\d{11}$'),
  CONSTRAINT pin_4_digits CHECK (pin ~ '^\d{4}$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_credentials TO authenticated;
GRANT ALL ON public.admin_credentials TO service_role;

ALTER TABLE public.admin_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own admin credentials" ON public.admin_credentials
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_admin_credentials_updated
BEFORE UPDATE ON public.admin_credentials
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public lookup: given mobile + pin, return associated email (or NULL).
CREATE OR REPLACE FUNCTION public.find_email_by_mobile_pin(_mobile text, _pin text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT email FROM public.admin_credentials
  WHERE mobile = _mobile AND pin = _pin
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_email_by_mobile_pin(text, text) TO anon, authenticated;