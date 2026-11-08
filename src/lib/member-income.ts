export type IncomeInput = {
  memberType: "daily" | "monthly";
  memberRate: number;
  generalPresent?: Array<{
    date: string;
    rate_override?: number | null;
  }>;
  shootings?: Array<{
    shoot_date: string;
    earned: number;
  }>;
  salaries?: Array<{
    month: string;
    amount: number;
  }>;
  bonuses?: Array<{
    given_at: string;
    amount: number;
  }>;
};

export type MemberIncomeStats = {
  totalEarned: number;
  totalBonus: number;
  totalIncome: number;
  activeMonthsCount: number;
  avgMonthlyIncome: number;
  monthlyBreakdown: Record<string, number>;
};

export function calculateMemberAverageIncome(input: IncomeInput): MemberIncomeStats {
  const { memberType, memberRate, generalPresent, shootings, salaries, bonuses } = input;
  const monthlyBreakdown: Record<string, number> = {};

  let totalEarned = 0;

  if (memberType === "daily") {
    if (generalPresent) {
      generalPresent.forEach((a) => {
        const ym = a.date.slice(0, 7);
        const amt = Number(a.rate_override ?? memberRate ?? 0);
        monthlyBreakdown[ym] = (monthlyBreakdown[ym] ?? 0) + amt;
        totalEarned += amt;
      });
    } else if (shootings) {
      shootings.forEach((s) => {
        if (!s.shoot_date) return;
        const ym = s.shoot_date.slice(0, 7);
        const amt = Number(s.earned ?? memberRate ?? 0);
        monthlyBreakdown[ym] = (monthlyBreakdown[ym] ?? 0) + amt;
        totalEarned += amt;
      });
    }
  } else {
    // monthly member
    (salaries ?? []).forEach((s) => {
      if (!s.month) return;
      const ym = s.month.slice(0, 7);
      const amt = Number(s.amount ?? 0);
      monthlyBreakdown[ym] = (monthlyBreakdown[ym] ?? 0) + amt;
      totalEarned += amt;
    });
  }

  let totalBonus = 0;
  (bonuses ?? []).forEach((b) => {
    if (!b.given_at) return;
    const ym = b.given_at.slice(0, 7);
    const amt = Number(b.amount ?? 0);
    monthlyBreakdown[ym] = (monthlyBreakdown[ym] ?? 0) + amt;
    totalBonus += amt;
  });

  const totalIncome = totalEarned + totalBonus;
  const activeMonthsCount = Object.keys(monthlyBreakdown).length;

  let avgMonthlyIncome = 0;
  if (activeMonthsCount > 0) {
    avgMonthlyIncome = Math.round(totalIncome / activeMonthsCount);
  } else if (memberType === "monthly" && memberRate > 0) {
    avgMonthlyIncome = Math.round(Number(memberRate));
  }

  return {
    totalEarned,
    totalBonus,
    totalIncome,
    activeMonthsCount,
    avgMonthlyIncome,
    monthlyBreakdown,
  };
}

