import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { taka, toBn, bnDate } from "@/lib/format";
import { Clapperboard, ChevronDown, Calendar, Users, Receipt, MapPin } from "lucide-react";

type Shooting = {
  id: string;
  name: string;
  shoot_date: string;
  location: string | null;
  director: string | null;
  channel: string | null;
};

const BN_MONTHS = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

export function MonthShootingsDetails() {
  const now = new Date();
  const monthLabel = `${BN_MONTHS[now.getMonth()]} ${toBn(String(now.getFullYear()))}`;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data: shootings = [], isLoading } = useQuery({
    queryKey: ["month-shootings", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date, location, director, channel")
        .gte("shoot_date", monthStart)
        .lte("shoot_date", monthEnd)
        .order("shoot_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Shooting[];
    },
  });

  const ids = shootings.map((s) => s.id);
  const summaries = useQuery({
    queryKey: ["month-shooting-summaries", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const out: Record<string, { total: number; att: number; extra: number; present: number }> = {};
      await Promise.all(
        ids.map(async (id) => {
          const { data } = await supabase.rpc("shooting_summary", { _shooting_id: id });
          const r = (data as { total_cost?: number; attendance_cost?: number; extra_cost?: number; present_count?: number }[] | null)?.[0];
          out[id] = {
            total: Number(r?.total_cost ?? 0),
            att: Number(r?.attendance_cost ?? 0),
            extra: Number(r?.extra_cost ?? 0),
            present: Number(r?.present_count ?? 0),
          };
        }),
      );
      return out;
    },
  });

  const totals = useMemo(() => {
    const s = summaries.data ?? {};
    return Object.values(s).reduce(
      (acc, r) => ({ total: acc.total + r.total, att: acc.att + r.att, extra: acc.extra + r.extra }),
      { total: 0, att: 0, extra: 0 },
    );
  }, [summaries.data]);

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Clapperboard className="h-4 w-4 text-primary" /> এই মাসের শুটিং
        </h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{monthLabel}</span>
      </div>

      {isLoading && <div className="py-4 text-center text-xs text-muted-foreground">লোড হচ্ছে…</div>}
      {!isLoading && shootings.length === 0 && (
        <div className="py-4 text-center text-xs text-muted-foreground">এই মাসে কোনো শুটিং হয়নি</div>
      )}

      {shootings.length > 0 && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 rounded-2xl bg-primary/10 p-3 text-center">
            <div>
              <div className="text-[10px] text-muted-foreground">শুটিং</div>
              <div className="text-sm font-bold text-primary">{toBn(shootings.length)} টি</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">হাজিরা খরচ</div>
              <div className="text-sm font-bold">{taka(totals.att)}</div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">মোট খরচ</div>
              <div className="text-sm font-bold text-primary">{taka(totals.total)}</div>
            </div>
          </div>

          <ul className="space-y-2">
            {shootings.map((s) => (
              <ShootingRow key={s.id} shooting={s} summary={summaries.data?.[s.id]} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

type AttRow = {
  id: string;
  present: boolean;
  rate_override: number | null;
  members: { id: string; name: string; rate: number; photo_url: string | null } | null;
};

type ExpRow = { id: string; amount: number; note: string | null; spent_at: string };

function ShootingRow({
  shooting: s,
  summary,
}: {
  shooting: Shooting;
  summary: { total: number; att: number; extra: number; present: number } | undefined;
}) {
  const [open, setOpen] = useState(false);

  const attendance = useQuery({
    queryKey: ["shooting-attendance-detail", s.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, present, rate_override, members(id, name, rate, photo_url)")
        .eq("shooting_id", s.id)
        .eq("present", true);
      if (error) throw error;
      return (data ?? []) as unknown as AttRow[];
    },
  });

  const expenses = useQuery({
    queryKey: ["shooting-expenses-detail", s.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shooting_expenses")
        .select("id, amount, note, spent_at")
        .eq("shooting_id", s.id)
        .order("spent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ExpRow[];
    },
  });

  return (
    <li className="rounded-2xl border bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 p-2.5 text-left"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Clapperboard className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{s.name}</div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5"><Calendar className="h-3 w-3" />{bnDate(s.shoot_date)}</span>
            {summary && <span className="inline-flex items-center gap-0.5"><Users className="h-3 w-3" />{toBn(summary.present)}</span>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-muted-foreground">মোট খরচ</div>
          <div className="text-sm font-bold text-primary">{taka(summary?.total ?? 0)}</div>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/60 p-3">
          {(s.location || s.director || s.channel) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {s.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{s.location}</span>}
              {s.director && <span>পরিচালক: {s.director}</span>}
              {s.channel && <span>চ্যানেল: {s.channel}</span>}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/30 p-2 text-center text-[11px]">
            <div>
              <div className="text-muted-foreground">হাজিরা খরচ</div>
              <div className="font-semibold">{taka(summary?.att ?? 0)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">অতিরিক্ত খরচ</div>
              <div className="font-semibold">{taka(summary?.extra ?? 0)}</div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
              <Users className="h-3.5 w-3.5 text-primary" /> হাজিরা তালিকা
            </div>
            {attendance.isLoading ? (
              <div className="py-2 text-center text-xs text-muted-foreground">লোড হচ্ছে…</div>
            ) : (attendance.data ?? []).length === 0 ? (
              <div className="rounded-lg bg-muted/30 py-2 text-center text-xs text-muted-foreground">কোনো হাজিরা নেই</div>
            ) : (
              <ul className="space-y-1">
                {(attendance.data ?? []).map((a, i) => {
                  const rate = a.rate_override ?? a.members?.rate ?? 0;
                  return (
                    <li key={a.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5 text-xs">
                      <span className="w-5 shrink-0 text-center text-[10px] text-muted-foreground">{toBn(i + 1)}.</span>
                      <div className="min-w-0 flex-1 truncate">{a.members?.name ?? "—"}</div>
                      <span className={`shrink-0 font-semibold ${Number(rate) > 0 ? "text-primary" : "text-muted-foreground"}`}>
                        {Number(rate) > 0 ? taka(Number(rate)) : "মাসিক"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
              <Receipt className="h-3.5 w-3.5 text-primary" /> অতিরিক্ত খরচ
            </div>
            {expenses.isLoading ? (
              <div className="py-2 text-center text-xs text-muted-foreground">লোড হচ্ছে…</div>
            ) : (expenses.data ?? []).length === 0 ? (
              <div className="rounded-lg bg-muted/30 py-2 text-center text-xs text-muted-foreground">কোনো অতিরিক্ত খরচ নেই</div>
            ) : (
              <ul className="space-y-1">
                {(expenses.data ?? []).map((e, i) => (
                  <li key={e.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2.5 py-1.5 text-xs">
                    <span className="w-5 shrink-0 text-center text-[10px] text-muted-foreground">{toBn(i + 1)}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-muted-foreground">{bnDate(e.spent_at)}</div>
                      {e.note && <div className="truncate">{e.note}</div>}
                    </div>
                    <span className="shrink-0 font-semibold text-primary">{taka(e.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
