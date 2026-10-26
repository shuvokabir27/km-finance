CREATE UNIQUE INDEX IF NOT EXISTS member_accounts_member_kind_number_unique
ON public.member_accounts (member_id, kind, btrim(account_number));

CREATE OR REPLACE FUNCTION public.save_payment_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  k account_kind;
BEGIN
  IF NEW.bank_account_number IS NULL OR btrim(NEW.bank_account_number) = '' THEN
    RETURN NEW;
  END IF;
  IF NEW.method IS NULL OR NEW.method = 'cash' THEN
    RETURN NEW;
  END IF;
  BEGIN
    k := NEW.method::account_kind;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  INSERT INTO public.member_accounts (owner_id, member_id, kind, account_holder, account_number, bank_name)
  SELECT NEW.owner_id, NEW.member_id, k, m.name, btrim(NEW.bank_account_number), NULL
  FROM public.members m
  WHERE m.id = NEW.member_id
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;