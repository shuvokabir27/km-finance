ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS channel_id uuid REFERENCES public.channels(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.member_balance(_member_id uuid, _channel_id uuid DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  m public.members%ROWTYPE;
  earned NUMERIC := 0;
  paid NUMERIC := 0;
  bonus NUMERIC := 0;
BEGIN
  SELECT * INTO m FROM public.members WHERE id = _member_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  IF _channel_id IS NOT NULL THEN
    -- Shared-channel tab: earnings from this channel's shootings only,
    -- minus payments tagged with this channel.
    IF m.type = 'daily' THEN
      SELECT COALESCE(SUM(COALESCE(a.rate_override, m.rate)), 0) INTO earned
      FROM public.attendance a
      WHERE a.member_id = _member_id
        AND a.present = true
        AND EXISTS (
          SELECT 1 FROM public.shootings s
          JOIN public.channels c ON c.owner_id = s.owner_id AND c.name = s.channel
          WHERE s.id = a.shooting_id AND c.id = _channel_id
        );
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO paid
    FROM public.payments
    WHERE member_id = _member_id AND channel_id = _channel_id;

    RETURN earned - paid;
  END IF;

  -- General balance: exclude shared-channel attendance earnings
  -- and exclude payments made from a shared channel tab.
  IF m.type = 'daily' THEN
    SELECT COALESCE(SUM(COALESCE(a.rate_override, m.rate)), 0) INTO earned
    FROM public.attendance a
    WHERE a.member_id = _member_id
      AND a.present = true
      AND NOT EXISTS (
        SELECT 1 FROM public.shootings s
        JOIN public.channels c ON c.owner_id = s.owner_id AND c.name = s.channel
        WHERE s.id = a.shooting_id AND c.is_shared = true
      );
  ELSE
    SELECT COALESCE(SUM(amount), 0) INTO earned
    FROM public.monthly_salaries WHERE member_id = _member_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO bonus
  FROM public.bonuses WHERE member_id = _member_id;

  SELECT COALESCE(SUM(amount), 0) INTO paid
  FROM public.payments
  WHERE member_id = _member_id AND channel_id IS NULL;

  RETURN earned + bonus - paid;
END;
$function$;