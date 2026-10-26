import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { taka, toBn } from "@/lib/format";

type Member = { id: string; type: "daily" | "monthly"; rate: number };

const BN_MONTHS = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

function monthKey(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${BN_MONTHS[m - 1]} ${toBn(String(y))}`;
}

export function MemberMonthlyHistory({ member }: { member: Member }) {
  const { data, isLoading } = useQuery({
    queryKey: ["member-monthly-history", member.id, member.type, member.rate],
    queryFn: async () => {
      const [att, sal, pay, bon] = await Promise.all([
        supabase.from("attendance").select("date, present").eq("member_id", member.id),
        supabase.from("monthly_salaries").select("month, amount").eq("member_id", member.id),
        supabase.from("payments").select("paid_at, amount").eq("member_id", member.id),
        supabase.from("bonuses").select("given_at, amount").eq("member_id", member.id),
      ]);
      const earned: Record<string, number> = {};
      const paid: Record<string, number> = {};

      if (member.type === "daily") {
        (att.data ?? []).forEach((a: { date: string; present: boolean }) => {
          if (!a.present) return;
          const k = monthKey(a.date);
          earned[k] = (earned[k] ?? 0) + Number(member.rate);
        });
      } else {
        (sal.data ?? []).forEach((s: { month: string; amount: number }) => {
          const k = monthKey(s.month);
          earned[k] = (earned[k] ?? 0) + Number(s.amount);
        });
      }
      (bon.data ?? []).forEach((b: { given_at: string; amount: number }) => {
        const k = monthKey(b.given_at);
        earned[k] = (earned[k] ?? 0) + Number(b.amount);
      });
      (pay.data ?? []).forEach((p: { paid_at: string; amount: number }) => {
        const k = monthKey(p.paid_at);
        paid[k] = (paid[k] ?? 0) + Number(p.amount);
      });

      const keys = Array.from(new Set([...Object.keys(earned), ...Object.keys(paid)])).sort();
      let running = 0;
      const rows = keys.map((k) => {
        const e = earned[k] ?? 0;
        const p = paid[k] ?? 0;
        const carryIn = running;
        running = running + e - p;
        return { key: k, earned: e, paid: p, carryIn, balance: running };
      });
      return rows.reverse();
    },
  });

  if (isLoading) {
    return <div className="py-3 text-center text-xs text-muted-foreground">লোড হচ্ছে…</div>;
  }
  if (!data || data.length === 0) {
    return <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-center text-xs text-muted-foreground">কোনো মাসিক হিসাব নেই</div>;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">মাসিক হিসাব</div>
      <div className="space-y-2">
        {data.map((r) => (
          <div key={r.key} className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">{monthLabel(r.key)}</div>
              <div className={`text-sm font-bold ${r.balance > 0 ? "text-success" : r.balance < 0 ? "text-destructive" : ""}`}>
                {taka(r.balance)}
              </div>
            </div>
            {r.carryIn !== 0 && (
              <div className="mt-1.5 flex items-center justify-between rounded-md bg-warning/10 px-2 py-1 text-[11px]">
                <span className="text-muted-foreground">আগের মাসের বাকি</span>
                <span className={`font-semibold ${r.carryIn > 0 ? "text-warning-foreground" : "text-destructive"}`}>{taka(r.carryIn)}</span>
              </div>
            )}
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-md bg-muted/40 px-2 py-1">
                <div className="text-muted-foreground">আয়</div>
                <div className="font-semibold">{taka(r.earned)}</div>
              </div>
              <div className="rounded-md bg-muted/40 px-2 py-1">
                <div className="text-muted-foreground">পেমেন্ট</div>
                <div className="font-semibold">{taka(r.paid)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
