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
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs flex flex-col h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <CalendarDays className="h-4 w-4 text-red-600" /> মাসিক ক্যালেন্ডার
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="grid h-7 w-7 place-items-center rounded-full bg-muted/60 hover:bg-muted text-muted-foreground transition active:scale-95"
            aria-label="আগের মাস"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[100px] text-center text-xs font-bold text-slate-700">
            {BN_MONTHS[month]} {toBn(String(year))}
          </span>
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="grid h-7 w-7 place-items-center rounded-full bg-muted/60 hover:bg-muted text-muted-foreground transition active:scale-95"
            aria-label="পরের মাস"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-slate-600">
        {BN_WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5 flex-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} className="aspect-square" />;
          const items = byDay[d] || [];
          const has = items.length > 0;
          const isToday = isCurrentMonth && d === today.getDate();

          const hasClient = items.some((s) => isClientShooting(s));
          const hasOwn = items.some((s) => !isClientShooting(s));

          let cellClass = "bg-muted/20 text-slate-700 hover:bg-muted/40 cursor-pointer";
          let dots = null;

          if (hasClient && hasOwn) {
            cellClass = "bg-gradient-to-br from-emerald-100 via-white to-red-100 text-slate-900 font-bold border border-amber-300 hover:brightness-95 cursor-pointer shadow-2xs";
            dots = (
              <span className="mt-0.5 inline-flex items-center gap-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                <span className="h-1.5 w-1.5 rounded-full bg-red-600" />
              </span>
            );
          } else if (hasClient) {
            // Client channel shooting -> RED background
            cellClass = "bg-red-100 text-red-900 font-bold border border-red-300 hover:bg-red-200 cursor-pointer shadow-2xs";
            dots = <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-red-600" />;
          } else if (hasOwn) {
            // Own channel shooting -> GREEN background
            cellClass = "bg-emerald-100 text-emerald-900 font-bold border border-emerald-300 hover:bg-emerald-200 cursor-pointer shadow-2xs";
            dots = <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />;
          }

          if (isToday) {
            if (has) {
              cellClass += " ring-2 ring-slate-900 ring-offset-2 scale-105 shadow-md";
            } else {
              cellClass = "bg-slate-900 text-white font-black shadow-md shadow-slate-900/25 scale-105 cursor-pointer";
            }
          }

          return (
            <button
              type="button"
              key={i}
              disabled={!has && !isToday}
              onClick={() => setSelectedDate(fmt(new Date(year, month, d)))}
              title={items?.map((x) => `${x.name}${isClientShooting(x) ? " (ক্লায়েন্ট)" : " (নিজস্ব)"}`).join(", ")}
              className={`relative aspect-square rounded-xl text-center text-xs flex flex-col items-center justify-center transition-all ${cellClass}`}
            >
              <span>{toBn(d)}</span>
              {dots}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10.5px] pt-2 border-t border-border/40">
        <span className="inline-flex items-center gap-1.5 font-medium text-emerald-800">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-2xs" />
          নিজস্ব চ্যানেল (সবুজ)
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-red-700">
          <span className="h-2.5 w-2.5 rounded-full bg-red-600 shadow-2xs" />
          ক্লায়েন্ট চ্যানেল (লাল)
        </span>
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-900 shadow-2xs" />
          আজকের দিন
        </span>
      </div>

      <Dialog open={!!selectedDate} onOpenChange={(o) => !o && setSelectedDate(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-primary" />
              {selectedDate && bnDate(selectedDate)} — {toBn(selectedShootings.length)} টি শুটিং
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
