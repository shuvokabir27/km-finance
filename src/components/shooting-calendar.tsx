import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { taka, toBn, bnDate } from "@/lib/format";
import { useChannels } from "@/lib/brand";
import { fetchClientSummary } from "@/lib/client-summary";
import { CalendarDays, ChevronLeft, ChevronRight, Clapperboard, MapPin, Users, Receipt } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const BN_MONTHS = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];
const BN_WEEKDAYS = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"];

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type Shooting = {
  id: string;
  name: string;
  shoot_date: string;
  location: string | null;
  director: string | null;
  channel: string | null;
  contract_amount?: number | null;
};

export function ShootingCalendar() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthStart = fmt(new Date(year, month, 1));
  const monthEnd = fmt(new Date(year, month + 1, 0));

  const { data: channels = [] } = useChannels();
  const { data: clientSummary = [] } = useQuery({
    queryKey: ["client-channel-summary"],
    queryFn: fetchClientSummary,
    staleTime: 1000 * 60 * 5,
  });

  const clientChannelSet = useMemo(() => {
    const set = new Set<string>();
    clientSummary.forEach((c) => set.add(c.channel.trim().toLowerCase()));
    channels.forEach((c) => {
      if (c.is_own === false && !c.is_shared) {
        set.add(c.name.trim().toLowerCase());
      }
    });
    return set;
  }, [clientSummary, channels]);

  const isClientShooting = (s: Shooting) => {
    if (s.contract_amount != null && Number(s.contract_amount) > 0) return true;
    if (!s.channel) return false;
    return clientChannelSet.has(s.channel.trim().toLowerCase());
  };

  const { data: shootings = [] } = useQuery({
    queryKey: ["calendar-shootings", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date, location, director, channel, contract_amount")
        .gte("shoot_date", monthStart)
        .lte("shoot_date", monthEnd);
      if (error) throw error;
      return (data ?? []) as Shooting[];
    },
  });

  const byDay = useMemo(() => {
    const m: Record<number, Shooting[]> = {};
    shootings.forEach((s) => {
      const d = new Date(s.shoot_date).getDate();
      (m[d] ||= []).push(s);
    });
    return m;
  }, [shootings]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const selectedShootings = selectedDate
    ? shootings.filter((s) => s.shoot_date.slice(0, 10) === selectedDate)
    : [];

  return (
    <section className="relative overflow-hidden rounded-3xl border border-rose-200/70 dark:border-white/10 bg-gradient-to-br from-white via-rose-50/30 to-amber-50/20 dark:from-slate-900 dark:via-slate-900/95 dark:to-slate-950 p-4 sm:p-5 shadow-xs flex flex-col h-full">
      {/* Background radiant ambient light */}
      <div className="pointer-events-none absolute -top-12 -right-12 h-40 w-40 rounded-full bg-gradient-to-br from-rose-400/20 via-pink-400/15 to-amber-400/15 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-gradient-to-tr from-emerald-400/15 via-teal-400/10 to-transparent blur-2xl" />

      {/* Header */}
      <div className="relative z-10 mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <span className="grid h-7 w-7 place-items-center rounded-xl bg-gradient-to-br from-rose-500 via-red-500 to-rose-600 text-white shadow-md shadow-rose-500/30">
            <CalendarDays className="h-4 w-4" />
          </span>
          <span>মাসিক ক্যালেন্ডার</span>
        </h2>
        <div className="flex items-center gap-1 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-1 rounded-full border border-rose-200/60 dark:border-white/10 shadow-2xs">
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="grid h-7 w-7 place-items-center rounded-full hover:bg-rose-100/70 dark:hover:bg-slate-700 text-rose-700 dark:text-slate-300 transition active:scale-95 cursor-pointer"
            aria-label="আগের মাস"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[105px] text-center text-xs font-black text-rose-950 dark:text-slate-100 px-1">
            {BN_MONTHS[month]} {toBn(String(year))}
          </span>
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="grid h-7 w-7 place-items-center rounded-full hover:bg-rose-100/70 dark:hover:bg-slate-700 text-rose-700 dark:text-slate-300 transition active:scale-95 cursor-pointer"
            aria-label="পরের মাস"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Weekdays Header */}
      <div className="relative z-10 mb-2.5 grid grid-cols-7 gap-1 text-center text-[11px] font-bold">
        {BN_WEEKDAYS.map((w, idx) => {
          const isFriday = idx === 5; // শুক্র
          const isSaturday = idx === 6; // শনি
          return (
            <div
              key={w}
              className={`py-1 rounded-lg ${
                isFriday
                  ? "bg-rose-100/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 font-black shadow-2xs"
                  : isSaturday
                  ? "bg-amber-100/70 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400 font-bold"
                  : "bg-white/60 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300"
              }`}
            >
              {w}
            </div>
          );
        })}
      </div>

      {/* Dates Grid */}
      <div className="relative z-10 grid grid-cols-7 gap-1.5 flex-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="aspect-square" />;
          const items = byDay[d] || [];
          const has = items.length > 0;
          const isToday = isCurrentMonth && d === today.getDate();
          const dayOfWeek = new Date(year, month, d).getDay();
          const isFriday = dayOfWeek === 5;

          const hasClient = items.some((s) => isClientShooting(s));
          const hasOwn = items.some((s) => !isClientShooting(s));

          let cellClass = isFriday
            ? "bg-rose-50/70 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300 hover:bg-rose-100/80 border border-rose-200/50 shadow-2xs font-semibold cursor-pointer"
            : "bg-white/85 dark:bg-slate-800/60 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 hover:border-rose-300 hover:text-rose-600 border border-slate-200/60 dark:border-white/5 shadow-2xs font-semibold cursor-pointer transition-all";
          let dots = null;

          if (hasClient && hasOwn) {
            cellClass = "bg-gradient-to-br from-emerald-500 via-teal-500 to-rose-500 text-white font-black shadow-md shadow-emerald-500/25 border-0 hover:scale-110 active:scale-95 cursor-pointer";
            dots = (
              <span className="mt-0.5 inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-white shadow-xs animate-pulse" />
                <span className="h-1.5 w-1.5 rounded-full bg-amber-300 shadow-xs animate-pulse" />
              </span>
            );
          } else if (hasClient) {
            // Client channel shooting -> Vivid Ruby/Rose Red Gradient
            cellClass = "bg-gradient-to-br from-rose-500 via-red-500 to-rose-600 text-white font-black shadow-md shadow-rose-500/35 border-0 hover:scale-110 active:scale-95 cursor-pointer";
            dots = <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-white shadow-xs" />;
          } else if (hasOwn) {
            // Own channel shooting -> Vibrant Emerald/Teal Green Gradient
            cellClass = "bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white font-black shadow-md shadow-emerald-500/35 border-0 hover:scale-110 active:scale-95 cursor-pointer";
            dots = <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-white shadow-xs" />;
          }

          if (isToday) {
            if (has) {
              cellClass += " ring-3 ring-amber-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-900 shadow-xl scale-105 z-10";
            } else {
              cellClass = "bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-700 text-white font-black shadow-lg shadow-indigo-500/40 ring-2 ring-indigo-300 ring-offset-1 scale-105 cursor-pointer z-10";
              dots = <span className="mt-0.5 inline-block text-[9px] font-black text-amber-300 tracking-tighter">আজ</span>;
            }
          }

          return (
            <button
              type="button"
              key={i}
              disabled={!has && !isToday}
              onClick={() => setSelectedDate(fmt(new Date(year, month, d)))}
              title={items?.map((x) => `${x.name}${isClientShooting(x) ? " (ক্লায়েন্ট)" : " (নিজস্ব)"}`).join(", ")}
              className={`relative aspect-square rounded-xl text-center text-xs flex flex-col items-center justify-center transition-all duration-200 ${cellClass}`}
            >
              <span>{toBn(d)}</span>
              {dots}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="relative z-10 mt-3.5 flex flex-wrap items-center justify-between gap-1.5 text-[10.5px] pt-3 border-t border-rose-200/50 dark:border-white/10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/90 dark:bg-emerald-950/50 border border-emerald-300/80 text-emerald-800 dark:text-emerald-300 px-2.5 py-1 font-bold shadow-2xs">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-xs" />
          নিজস্ব চ্যানেল (সবুজ)
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100/90 dark:bg-rose-950/50 border border-rose-300/80 text-rose-800 dark:text-rose-300 px-2.5 py-1 font-bold shadow-2xs">
          <span className="h-2 w-2 rounded-full bg-rose-600 shadow-xs" />
          ক্লায়েন্ট চ্যানেল (লাল)
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100/90 dark:bg-indigo-950/50 border border-indigo-300/80 text-indigo-800 dark:text-indigo-300 px-2.5 py-1 font-bold shadow-2xs">
          <span className="h-2 w-2 rounded-full bg-indigo-600 shadow-xs" />
          আজকের দিন
        </span>
      </div>

      <Dialog open={!!selectedDate} onOpenChange={(o) => !o && setSelectedDate(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-xs">
                <CalendarDays className="h-4 w-4" />
              </span>
              <span>{selectedDate && bnDate(selectedDate)} — {toBn(selectedShootings.length)} টি শুটিং</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedShootings.map((s) => (
              <ShootingDetailCard
                key={s.id}
                shooting={s}
                isClient={isClientShooting(s)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

type AttRow = {
  id: string;
  rate_override: number | null;
  members: { name: string; rate: number } | null;
};

type ExpRow = { id: string; amount: number; note: string | null };

function ShootingDetailCard({
  shooting: s,
  isClient,
}: {
  shooting: Shooting;
  isClient?: boolean;
}) {
  const summary = useQuery({
    queryKey: ["shooting-summary", s.id],
    queryFn: async () => {
      const { data } = await supabase.rpc("shooting_summary", { _shooting_id: s.id });
      const r = (data as { total_cost?: number; attendance_cost?: number; extra_cost?: number; present_count?: number }[] | null)?.[0];
      return {
        total: Number(r?.total_cost ?? 0),
        att: Number(r?.attendance_cost ?? 0),
        extra: Number(r?.extra_cost ?? 0),
        present: Number(r?.present_count ?? 0),
      };
    },
  });

  const attendance = useQuery({
    queryKey: ["shooting-attendance-detail", s.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, rate_override, members(name, rate)")
        .eq("shooting_id", s.id)
        .eq("present", true);
      if (error) throw error;
      return (data ?? []) as unknown as AttRow[];
    },
  });

  const expenses = useQuery({
    queryKey: ["shooting-expenses-detail", s.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shooting_expenses")
        .select("id, amount, note")
        .eq("shooting_id", s.id);
      if (error) throw error;
      return (data ?? []) as ExpRow[];
    },
  });

  return (
    <div className="rounded-2xl border bg-card p-3 space-y-2.5">
      <div className="flex items-start gap-2">
        <span
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${
            isClient ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
          }`}
        >
          <Clapperboard className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{s.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                isClient
                  ? "bg-red-100 text-red-700 border border-red-200"
                  : "bg-emerald-100 text-emerald-700 border border-emerald-200"
              }`}
            >
              {isClient ? "ক্লায়েন্ট" : "নিজস্ব"}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
            {s.channel && <span>চ্যানেল: {s.channel}</span>}
            {s.director && <span>পরিচালক: {s.director}</span>}
            {s.location && (
              <span className="inline-flex items-center gap-0.5">
                <MapPin className="h-3 w-3" />
                {s.location}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-xl bg-primary/10 p-2 text-center">
        <div>
          <div className="text-[10px] text-muted-foreground">হাজিরা</div>
          <div className="text-xs font-bold text-primary">{toBn(summary.data?.present ?? 0)} জন</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">হাজিরা খরচ</div>
          <div className="text-xs font-bold">{taka(summary.data?.att ?? 0)}</div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">মোট খরচ</div>
          <div className="text-xs font-bold text-primary">{taka(summary.data?.total ?? 0)}</div>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold">
          <Users className="h-3 w-3 text-primary" /> হাজিরা তালিকা
        </div>
        {(attendance.data ?? []).length === 0 ? (
          <div className="rounded-lg bg-muted/30 py-1.5 text-center text-[11px] text-muted-foreground">কেউ ছিল না</div>
        ) : (
          <ul className="space-y-1">
            {(attendance.data ?? []).map((a, i) => {
              const rate = a.rate_override ?? a.members?.rate ?? 0;
              return (
                <li key={a.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2 py-1 text-[11px]">
                  <span className="w-4 text-center text-[10px] text-muted-foreground">{toBn(i + 1)}.</span>
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

      {(expenses.data ?? []).length > 0 && (
        <div>
          <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold">
            <Receipt className="h-3 w-3 text-primary" /> অতিরিক্ত খরচ
          </div>
          <ul className="space-y-1">
            {(expenses.data ?? []).map((e) => (
              <li key={e.id} className="flex items-center gap-2 rounded-lg bg-muted/30 px-2 py-1 text-[11px]">
                <div className="min-w-0 flex-1 truncate">{e.note || "—"}</div>
                <span className="shrink-0 font-semibold text-primary">{taka(e.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
