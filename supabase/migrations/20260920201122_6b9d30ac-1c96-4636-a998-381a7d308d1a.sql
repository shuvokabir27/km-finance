ALTER TABLE public.channels ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

CREATE TYPE public.income_source AS ENUM ('facebook', 'youtube', 'ads', 'other');

CREATE TABLE public.channel_partners (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  partner_name text NOT NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  share_percent numeric NOT NULL DEFAULT 50,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_partners TO authenticated;
GRANT ALL ON public.channel_partners TO service_role;
ALTER TABLE public.channel_partners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own channel partners" ON public.channel_partners FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_channel_partners_updated BEFORE UPDATE ON public.channel_partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.channel_incomes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  shooting_id uuid REFERENCES public.shootings(id) ON DELETE SET NULL,
  source public.income_source NOT NULL DEFAULT 'other',
  amount numeric NOT NULL DEFAULT 0,
  earned_at date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.channel_incomes TO authenticated;
GRANT ALL ON public.channel_incomes TO service_role;
ALTER TABLE public.channel_incomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own channel incomes" ON public.channel_incomes FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_channel_incomes_updated BEFORE UPDATE ON public.channel_incomes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.partner_payouts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id uuid NOT NULL,
  partner_id uuid NOT NULL REFERENCES public.channel_partners(id) ON DELETE CASCADE,
  amount numeric NOT NULL DEFAULT 0,
  method text NOT NULL DEFAULT 'cash',
  bank_account_number text,
  note text,
  paid_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_payouts TO authenticated;
GRANT ALL ON public.partner_payouts TO service_role;
ALTER TABLE public.partner_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own partner payouts" ON public.partner_payouts FOR ALL TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE TRIGGER trg_partner_payouts_updated BEFORE UPDATE ON public.partner_payouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_channel_partners_channel ON public.channel_partners(channel_id);
CREATE INDEX idx_channel_incomes_channel ON public.channel_incomes(channel_id);
CREATE INDEX idx_partner_payouts_partner ON public.partner_payouts(partner_id);

CREATE OR REPLACE FUNCTION public.shared_channel_summary()
RETURNS TABLE(
  channel_id uuid,
  channel_name text,
  income_total numeric,
  expense_total numeric,
  net_profit numeric,
  partner_count bigint
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH ch AS (
    SELECT id, name FROM public.channels
    WHERE owner_id = auth.uid() AND is_shared = true
  ),
  inc AS (
    SELECT ci.channel_id, COALESCE(SUM(ci.amount), 0) AS total
    FROM public.channel_incomes ci
    WHERE ci.owner_id = auth.uid()
    GROUP BY ci.channel_id
  ),
  shoots AS (
    SELECT ch.id AS channel_id, s.id AS shooting_id
    FROM ch
    JOIN public.shootings s ON s.channel = ch.name AND s.owner_id = auth.uid()
  ),
  att AS (
    SELECT sh.channel_id, COALESCE(SUM(COALESCE(a.rate_override, m.rate)), 0) AS total
    FROM shoots sh
    JOIN public.attendance a ON a.shooting_id = sh.shooting_id AND a.present = true
    JOIN public.members m ON m.id = a.member_id
    GROUP BY sh.channel_id
  ),
  ext AS (
    SELECT sh.channel_id, COALESCE(SUM(e.amount), 0) AS total
    FROM shoots sh
    JOIN public.shooting_expenses e ON e.shooting_id = sh.shooting_id
    GROUP BY sh.channel_id
  ),
  pc AS (
    SELECT cp.channel_id, COUNT(*) AS cnt
    FROM public.channel_partners cp
    WHERE cp.owner_id = auth.uid()
    GROUP BY cp.channel_id
  )
  SELECT
    ch.id,
    ch.name,
    COALESCE(inc.total, 0),
    COALESCE(att.total, 0) + COALESCE(ext.total, 0),
    COALESCE(inc.total, 0) - (COALESCE(att.total, 0) + COALESCE(ext.total, 0)),
    COALESCE(pc.cnt, 0)
  FROM ch
  LEFT JOIN inc ON inc.channel_id = ch.id
  LEFT JOIN att ON att.channel_id = ch.id
  LEFT JOIN ext ON ext.channel_id = ch.id
  LEFT JOIN pc ON pc.channel_id = ch.id
  ORDER BY ch.name;
$$;

CREATE OR REPLACE FUNCTION public.partner_ledger()
RETURNS TABLE(
  partner_id uuid,
  partner_name text,
  channel_id uuid,
  channel_name text,
  share_percent numeric,
  net_profit numeric,
  entitled numeric,
  paid_total numeric,
  due numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH sums AS (
    SELECT * FROM public.shared_channel_summary()
  ),
  pays AS (
    SELECT pp.partner_id, COALESCE(SUM(pp.amount), 0) AS total
    FROM public.partner_payouts pp
    WHERE pp.owner_id = auth.uid()
    GROUP BY pp.partner_id
  )
  SELECT
    cp.id,
    cp.partner_name,
    cp.channel_id,
    s.channel_name,
    cp.share_percent,
    COALESCE(s.net_profit, 0),
    ROUND(GREATEST(COALESCE(s.net_profit, 0), 0) * cp.share_percent / 100.0, 2),
    COALESCE(pays.total, 0),
    ROUND(GREATEST(COALESCE(s.net_profit, 0), 0) * cp.share_percent / 100.0, 2) - COALESCE(pays.total, 0)
  FROM public.channel_partners cp
  LEFT JOIN sums s ON s.channel_id = cp.channel_id
  LEFT JOIN pays ON pays.partner_id = cp.id
  WHERE cp.owner_id = auth.uid()
  ORDER BY s.channel_name, cp.partner_name;
$$;