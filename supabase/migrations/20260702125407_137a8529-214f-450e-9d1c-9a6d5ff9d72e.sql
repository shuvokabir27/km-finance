-- Trigger fn: when a shooting is created, auto-attend all monthly members
CREATE OR REPLACE FUNCTION public.auto_attend_monthly_on_shooting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.attendance (owner_id, member_id, date, present, shooting_id, rate_override)
  SELECT NEW.owner_id, m.id, NEW.shoot_date, true, NEW.id, 0
  FROM public.members m
  WHERE m.owner_id = NEW.owner_id AND m.type = 'monthly'
  ON CONFLICT (member_id, date) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shootings_auto_attend_monthly ON public.shootings;
CREATE TRIGGER shootings_auto_attend_monthly
AFTER INSERT ON public.shootings
FOR EACH ROW EXECUTE FUNCTION public.auto_attend_monthly_on_shooting();

-- Trigger fn: when a monthly member is created, auto-attend all existing shootings
CREATE OR REPLACE FUNCTION public.auto_attend_shootings_on_monthly_member()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'monthly' THEN
    INSERT INTO public.attendance (owner_id, member_id, date, present, shooting_id, rate_override)
    SELECT NEW.owner_id, NEW.id, s.shoot_date, true, s.id, 0
    FROM public.shootings s
    WHERE s.owner_id = NEW.owner_id
    ON CONFLICT (member_id, date) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS members_auto_attend_shootings ON public.members;
CREATE TRIGGER members_auto_attend_shootings
AFTER INSERT ON public.members
FOR EACH ROW EXECUTE FUNCTION public.auto_attend_shootings_on_monthly_member();

-- Backfill: for every existing monthly member, add attendance to every existing shooting
INSERT INTO public.attendance (owner_id, member_id, date, present, shooting_id, rate_override)
SELECT s.owner_id, m.id, s.shoot_date, true, s.id, 0
FROM public.shootings s
JOIN public.members m ON m.owner_id = s.owner_id AND m.type = 'monthly'
ON CONFLICT (member_id, date) DO NOTHING;