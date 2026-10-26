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

  IF NOT EXISTS (
    SELECT 1 FROM public.member_accounts
    WHERE member_id = NEW.member_id
      AND kind = k
      AND account_number = btrim(NEW.bank_account_number)
  ) THEN
    INSERT INTO public.member_accounts (owner_id, member_id, kind, account_holder, account_number, bank_name)
    SELECT NEW.owner_id, NEW.member_id, k, m.name, btrim(NEW.bank_account_number), NULL
    FROM public.members m WHERE m.id = NEW.member_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_save_account ON public.payments;
CREATE TRIGGER payments_save_account
AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.save_payment_account();