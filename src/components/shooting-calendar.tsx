import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { taka, toBn, bnDate } from "@/lib/format";
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
};

export function ShootingCalendar() {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthStart = fmt(new Date(year, month, 1));
  const monthEnd = fmt(new Date(year, month + 1, 0));

  const { data: shootings = [] } = useQuery({
    queryKey: ["calendar-shootings", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date, location, director, channel")
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
    <section className="rounded-3xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <CalendarDays className="h-4 w-4 text-primary" /> শুটিং ক্যালেন্ডার
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            className="grid h-7 w-7 place-items-center rounded-full bg-muted hover:bg-muted/70"
            aria-label="আগের মাস"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[110px] text-center text-xs font-medium">
            {BN_MONTHS[month]} {toBn(String(year))}
          </span>
          <button
            type="button"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            className="grid h-7 w-7 place-items-center rounded-full bg-muted hover:bg-muted/70"
            aria-label="পরের মাস"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
        {BN_WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const items = byDay[d];
          const has = !!items?.length;
          const isToday = isCurrentMonth && d === today.getDate();
          return (
            <button
              type="button"
              key={i}
              disabled={!has}
              onClick={() => has && setSelectedDate(fmt(new Date(year, month, d)))}
              title={items?.map((x) => x.name).join(", ")}
              className={`relative aspect-square rounded-lg text-center text-xs flex flex-col items-center justify-center transition ${
                has
                  ? "bg-primary/15 text-primary font-semibold hover:bg-primary/25 cursor-pointer"
                  : "bg-muted/30 text-muted-foreground cursor-default"
              } ${isToday ? "ring-2 ring-primary" : ""}`}
            >
              <span>{toBn(d)}</span>
              {has && (
                <span className="mt-0.5 inline-flex items-center gap-0.5 text-[9px]">
                  <Clapperboard className="h-2.5 w-2.5" />
                  {toBn(items.length)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-primary/15" /> শুটিং হয়েছে
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-3 w-3 rounded ring-2 ring-primary" /> আজ
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
              <ShootingDetailCard key={s.id} shooting={s} />
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

function ShootingDetailCard({ shooting: s }: { shooting: Shooting }) {
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
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Clapperboard className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{s.name}</div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
            {s.channel && <span>চ্যানেল: {s.channel}</span>}
            {s.director && <span>পরিচালক: {s.director}</span>}
            {s.location && <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{s.location}</span>}
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
