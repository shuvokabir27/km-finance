import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { taka, toBn, bnDate } from "@/lib/format";
import { saveMemberAccountIfNew } from "@/lib/save-member-account";
import { ACCOUNT_KIND_LABEL, type AccountKind } from "@/lib/bd-banks";
import { ArrowUpRight, Clapperboard, Wallet, BadgeDollarSign, TrendingUp, Plus, FileText, Download, Users, MessageSquare, Loader2, Handshake, ReceiptText, Landmark, Smartphone } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendBulkSmsToMembers, getBulkSmsBalance } from "@/lib/bulk-sms.functions";
import { MemberAvatar } from "@/components/member-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MonthShootingsDetails } from "@/components/month-shootings-details";
import { ShootingCalendar } from "@/components/shooting-calendar";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

type ShootingRow = {
  id: string;
  name: string;
  shoot_date: string;
};

type PaymentRow = {
  id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  member: { name: string; photo_url: string | null } | null;
};

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const monthStartDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const monthStartISO = monthStartDate.toISOString();
      const monthStartDay = monthStartISO.slice(0, 10);

      const [membersRes, attRes, salRes, bonRes, payRes, chRes, shRes] = await Promise.all([
        supabase.from("members").select("id, name, photo_url, type, rate"),
        supabase.from("attendance").select("member_id, date, present, rate_override, shooting_id"),
        supabase.from("monthly_salaries").select("member_id, month, amount"),
        supabase.from("bonuses").select("member_id, given_at, amount"),
        supabase.from("payments").select("member_id, paid_at, amount").is("channel_id", null),
        supabase.from("channels").select("name").eq("is_shared", true),
        supabase.from("shootings").select("id, channel"),
      ]);
      const sharedNames = new Set((chRes.data ?? []).map((c: { name: string }) => c.name));
      const sharedShoots = new Set(
        (shRes.data ?? []).filter((s: { channel: string | null }) => s.channel && sharedNames.has(s.channel)).map((s: { id: string }) => s.id),
      );

      type M = { id: string; name: string; photo_url: string | null; type: "daily" | "monthly"; rate: number };
      const members = (membersRes.data ?? []) as M[];
      const prev: Record<string, number> = {};
      const curr: Record<string, number> = {};
      for (const m of members) { prev[m.id] = 0; curr[m.id] = 0; }
      const rateOf: Record<string, { type: string; rate: number }> = {};
      members.forEach((m) => { rateOf[m.id] = { type: m.type, rate: Number(m.rate) }; });

      (attRes.data ?? []).forEach((a: { member_id: string; date: string; present: boolean; rate_override: number | null; shooting_id: string | null }) => {
        if (!a.present) return;
        if (a.shooting_id && sharedShoots.has(a.shooting_id)) return;
        const info = rateOf[a.member_id];
        if (!info || info.type !== "daily") return;
        const amt = Number(a.rate_override ?? info.rate);
        if (a.date >= monthStartDay) curr[a.member_id] = (curr[a.member_id] ?? 0) + amt;
        else prev[a.member_id] = (prev[a.member_id] ?? 0) + amt;
      });
      (salRes.data ?? []).forEach((s: { member_id: string; month: string; amount: number }) => {
        const amt = Number(s.amount);
        if (s.month >= monthStartDay) curr[s.member_id] = (curr[s.member_id] ?? 0) + amt;
        else prev[s.member_id] = (prev[s.member_id] ?? 0) + amt;
      });
      (bonRes.data ?? []).forEach((b: { member_id: string; given_at: string; amount: number }) => {
        const amt = Number(b.amount);
        if (b.given_at >= monthStartDay) curr[b.member_id] = (curr[b.member_id] ?? 0) + amt;
        else prev[b.member_id] = (prev[b.member_id] ?? 0) + amt;
      });
      let paidThisMonth = 0;
      (payRes.data ?? []).forEach((p: { member_id: string; paid_at: string; amount: number }) => {
        const amt = Number(p.amount);
        if (p.paid_at >= monthStartISO) {
          curr[p.member_id] = (curr[p.member_id] ?? 0) - amt;
          paidThisMonth += amt;
        } else {
          prev[p.member_id] = (prev[p.member_id] ?? 0) - amt;
        }
      });

      let prevDue = 0;
      let currDue = 0;
      let outstanding = 0;
      const breakdown = members.map((m) => {
        const p = prev[m.id] ?? 0;
        const c = curr[m.id] ?? 0;
        // Settle across buckets: overpayment in one bucket offsets the other.
        // This ensures a fully-paid member never shows a due in either box.
        const showPrev = Math.max(0, p + Math.min(0, c));
        const showCurr = Math.max(0, c + Math.min(0, p));
        prevDue += showPrev;
        currDue += showCurr;
        const total = showPrev + showCurr;
        outstanding += total;
        return { id: m.id, name: m.name, photo_url: m.photo_url, prev: showPrev, curr: showCurr, total };
      });

      return { paidThisMonth, outstanding, prevDue, currDue, breakdown };
    },
  });

  const recentShootings = useQuery({
    queryKey: ["dashboard-recent-shootings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date")
        .order("shoot_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data as ShootingRow[];
    },
  });

  const shootingTotals = useQuery({
    queryKey: ["dashboard-shooting-totals", recentShootings.data?.map((s) => s.id).join(",")],
    enabled: (recentShootings.data?.length ?? 0) > 0,
    queryFn: async () => {
      const out: Record<string, number> = {};
      await Promise.all(
        (recentShootings.data ?? []).map(async (s) => {
          const { data } = await supabase.rpc("shooting_summary", { _shooting_id: s.id });
          const row = (data as { total_cost?: number }[] | null)?.[0];
          out[s.id] = Number(row?.total_cost ?? 0);
        }),
      );
      return out;
    },
  });

  const recentPayments = useQuery({
    queryKey: ["dashboard-recent-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, paid_at, note, member:members(name, photo_url)")
        .order("paid_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data as unknown as PaymentRow[];
    },
  });

  const monthName = new Date().toLocaleDateString("bn-BD", { month: "long", year: "numeric" });

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h >= 3 && h < 5) return { text: "শুভ সুবেহ সাদেক", emoji: "🌌" };
    if (h >= 5 && h < 12) return { text: "শুভ সকাল", emoji: "🌅" };
    if (h >= 12 && h < 15) return { text: "শুভ দুপুর", emoji: "☀️" };
    if (h >= 15 && h < 18) return { text: "শুভ বিকাল", emoji: "🌤️" };
    if (h >= 18 && h < 20) return { text: "শুভ সন্ধ্যা", emoji: "🌆" };
    return { text: "শুভ রাত্রি", emoji: "🌙" };
  };
  const greeting = getGreeting();

  return (
    <div className="space-y-5 min-[700px]:grid min-[700px]:grid-cols-2 min-[700px]:items-start min-[700px]:gap-5 min-[700px]:space-y-0 xl:grid-cols-3">
      <div className="text-center min-[700px]:col-span-2 xl:col-span-3">
        
        <h1 className="mt-0.5 text-[22px] font-bold leading-tight">{greeting.text} {greeting.emoji}</h1>
        <WeatherLine />
      </div>


      {/* Hero balance card */}
      <div className="hero-gradient relative overflow-hidden rounded-3xl p-5 shadow-lg min-[700px]:h-full">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-12 -left-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between text-primary-foreground/80">
            <span className="text-xs font-medium">মোট বকেয়া</span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px]">{monthName}</span>
          </div>
          <div className="mt-2 text-3xl font-black tracking-tight text-primary-foreground">
            {isLoading ? "…" : taka(data!.outstanding)}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <DueBreakdownDialog
              which="prev"
              title="পূর্বের বকেয়া"
              rows={data?.breakdown ?? []}
              total={data?.prevDue ?? 0}
              loading={isLoading}
            />
            <DueBreakdownDialog
              which="curr"
              title="এই মাসের বকেয়া"
              rows={data?.breakdown ?? []}
              total={data?.currDue ?? 0}
              loading={isLoading}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="text-[11px] text-primary-foreground/80">
              এই মাসে পরিশোধ
              <div className="text-sm font-semibold text-primary-foreground">
                {isLoading ? "…" : taka(data!.paidThisMonth)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DuesDialog />
              <Link
                to="/payments"
                className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-primary-foreground backdrop-blur-sm transition hover:bg-white/25"
              >
                পেমেন্ট <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <ClientDuesCard />
      <SharedChannelsCard />

      <TotalCostSection />

      <ShootingCalendar />

      <MonthShootingsDetails />




      {/* Recent shootings */}
      <section className="rounded-3xl border border-border/70 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Clapperboard className="h-4 w-4 text-primary" /> সাম্প্রতিক শুটিং
          </h2>
          <Link to="/shootings" className="text-xs font-medium text-primary hover:underline">
            সব দেখুন
          </Link>
        </div>
        {recentShootings.isLoading && <div className="py-3 text-center text-xs text-muted-foreground">লোড হচ্ছে…</div>}
        {!recentShootings.isLoading && (recentShootings.data?.length ?? 0) === 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground">এখনও কোনো শুটিং নেই</div>
        )}
        <ul className="space-y-2">
          {(recentShootings.data ?? []).map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-2xl border bg-background p-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Clapperboard className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="text-[11px] text-muted-foreground">{bnDate(s.shoot_date)}</div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground">মোট খরচ</div>
                <div className="text-sm font-bold text-primary">{taka(shootingTotals.data?.[s.id] ?? 0)}</div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Recent payments */}
      <section className="rounded-3xl border border-border/70 bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Wallet className="h-4 w-4 text-primary" /> পেমেন্ট হিস্ট্রি
          </h2>
          <Link to="/payments" className="text-xs font-medium text-primary hover:underline">
            সব দেখুন
          </Link>
        </div>
        {recentPayments.isLoading && <div className="py-3 text-center text-xs text-muted-foreground">লোড হচ্ছে…</div>}
        {!recentPayments.isLoading && (recentPayments.data?.length ?? 0) === 0 && (
          <div className="py-4 text-center text-xs text-muted-foreground">এখনও কোনো পেমেন্ট নেই</div>
        )}
        <ul className="space-y-2">
          {(recentPayments.data ?? []).map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-2xl border bg-background p-2.5">
              <MemberAvatar name={p.member?.name ?? "?"} photoUrl={p.member?.photo_url ?? null} size="md" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{p.member?.name ?? "—"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {bnDate(p.paid_at.slice(0, 10))}
                  {p.note ? ` • ${p.note}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1 text-sm font-bold text-success">
                <BadgeDollarSign className="h-3.5 w-3.5" />
                {taka(p.amount)}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="text-center text-[10.5px] text-muted-foreground min-[700px]:col-span-2 xl:col-span-3">
        সর্বশেষ {toBn(recentShootings.data?.length ?? 0)} টি শুটিং ও {toBn(recentPayments.data?.length ?? 0)} টি পেমেন্ট
      </div>
    </div>
  );
}

type ClientSummaryRow = {
  channel: string;
  shooting_count: number;
  contract_total: number;
  received_total: number;
  due_total: number;
};

function ClientDuesCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["client-channel-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_channel_summary");
      if (error) throw error;
      return ((data ?? []) as ClientSummaryRow[]).map((r) => ({
        channel: r.channel,
        due: Number(r.due_total),
        received: Number(r.received_total),
        contract: Number(r.contract_total),
      }));
    },
  });

  const totals = useMemo(() => {
    const rows = data ?? [];
    return rows.reduce(
      (acc, r) => ({
        contract: acc.contract + r.contract,
        received: acc.received + r.received,
        due: acc.due + r.due,
      }),
      { contract: 0, received: 0, due: 0 },
    );
  }, [data]);

  const topDue = useMemo(
    () => (data ?? []).filter((r) => r.due > 0).sort((a, b) => b.due - a.due).slice(0, 3),
    [data],
  );

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" /> ক্লায়েন্ট হিসাব
        </h2>
        <Link to="/client-dues" className="text-xs font-medium text-primary hover:underline">
          বিস্তারিত →
        </Link>
      </div>

      <Link
        to="/client-dues"
        className="block rounded-2xl bg-primary/10 p-4 transition hover:bg-primary/15"
      >
        <div className="text-[11px] text-muted-foreground">মোট বকেয়া</div>
        <div className="mt-1 text-2xl font-black text-primary">
          {isLoading ? "…" : taka(totals.due)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md bg-background/60 px-2 py-1.5">
            <div className="text-muted-foreground">মোট পাওনা</div>
            <div className="font-semibold">{taka(totals.contract)}</div>
          </div>
          <div className="rounded-md bg-background/60 px-2 py-1.5">
            <div className="text-muted-foreground">প্রাপ্ত</div>
            <div className="font-semibold text-success">{taka(totals.received)}</div>
          </div>
        </div>
      </Link>

      {topDue.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {topDue.map((r) => (
            <li key={r.channel} className="flex items-center justify-between rounded-xl border bg-background px-3 py-2 text-xs">
              <span className="truncate font-medium">{r.channel}</span>
              <span className="font-bold text-destructive">{taka(r.due)}</span>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && (data?.length ?? 0) === 0 && (
        <div className="mt-3 py-2 text-center text-[11px] text-muted-foreground">
          কোনো বাহিরের চ্যানেল নেই
        </div>
      )}
    </section>
  );
}

type SharedRow = {
  channel_id: string;
  channel_name: string;
  income_total: number;
  expense_total: number;
  net_profit: number;
};

type LedgerLite = { partner_id: string; partner_name: string; due: number; entitled: number };

function SharedChannelsCard() {
  const [expenseOpen, setExpenseOpen] = useState(false);
  const summary = useQuery({
    queryKey: ["shared-channel-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("shared_channel_summary");
      if (error) throw error;
      return ((data ?? []) as SharedRow[]).map((r) => ({
        ...r,
        income_total: Number(r.income_total),
        expense_total: Number(r.expense_total),
        net_profit: Number(r.net_profit),
      }));
    },
  });

  const ledger = useQuery({
    queryKey: ["partner-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("partner_ledger");
      if (error) throw error;
      return ((data ?? []) as LedgerLite[]).map((r) => ({
        partner_id: r.partner_id,
        partner_name: r.partner_name,
        due: Number(r.due),
        entitled: Number(r.entitled),
      }));
    },
  });

  const rows = summary.data ?? [];
  const totals = rows.reduce(
    (a, r) => ({ income: a.income + r.income_total, net: a.net + r.net_profit }),
    { income: 0, net: 0 },
  );
  const dues = (ledger.data ?? []).filter((r) => r.due > 0).sort((a, b) => b.due - a.due);
  const totalDue = dues.reduce((a, r) => a + r.due, 0);

  // এই মাসের শেয়ার চ্যানেল খরচ (হাজিরা + অন্যান্য)
  const monthExpense = useQuery({
    queryKey: ["shared-channel-month-expense", rows.map((r) => r.channel_name).join("|")],
    enabled: rows.length > 0,
    queryFn: async () => {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const pad = (n: number) => String(n).padStart(2, "0");
      const start = `${y}-${pad(m + 1)}-01`;
      const end = `${y}-${pad(m + 1)}-${pad(new Date(y, m + 1, 0).getDate())}`;
      const names = rows.map((r) => r.channel_name);

      const { data: shoots, error } = await supabase
        .from("shootings")
        .select("id, channel, shoot_date")
        .in("channel", names)
        .gte("shoot_date", start)
        .lte("shoot_date", end);
      if (error) throw error;
      type Shoot = { id: string; channel: string; shoot_date: string };
      const list = (shoots ?? []) as Shoot[];
      const ids = list.map((s) => s.id);
      const channelOf = new Map(list.map((s) => [s.id, s.channel]));
      const empty = {
        total: 0,
        channels: [] as { name: string; attendance: number; other: number; total: number; days: number; otherCount: number }[],
      };
      if (ids.length === 0) return empty;

      const [att, ext] = await Promise.all([
        supabase
          .from("attendance")
          .select("id, shooting_id, rate_override, members(rate)")
          .in("shooting_id", ids)
          .eq("present", true),
        supabase
          .from("shooting_expenses")
          .select("id, shooting_id, amount")
          .in("shooting_id", ids),
      ]);
      if (att.error) throw att.error;
      if (ext.error) throw ext.error;

      type Acc = { attendance: number; other: number; days: number; otherCount: number };
      const acc = new Map<string, Acc>();
      for (const name of names) acc.set(name, { attendance: 0, other: 0, days: 0, otherCount: 0 });
      for (const a of att.data ?? []) {
        const ch = channelOf.get(a.shooting_id ?? "");
        if (!ch) continue;
        const amount = Number(a.rate_override ?? a.members?.rate ?? 0);
        if (!amount) continue;
        const e = acc.get(ch)!;
        e.attendance += amount;
        e.days += 1;
      }
      for (const x of ext.data ?? []) {
        const ch = channelOf.get(x.shooting_id);
        if (!ch) continue;
        const e = acc.get(ch);
        if (!e) continue;
        e.other += Number(x.amount);
        e.otherCount += 1;
      }
      const channels = names
        .map((name) => {
          const e = acc.get(name)!;
          return { name, ...e, total: e.attendance + e.other };
        })
        .filter((c) => c.total > 0)
        .sort((a, b) => b.total - a.total);
      return {
        total: channels.reduce((a, c) => a + c.total, 0),
        channels,
      };
    },
  });


  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Handshake className="h-4 w-4 text-primary" /> শেয়ার চ্যানেল
        </h2>
        <Link to="/shared-channels" className="text-xs font-medium text-primary hover:underline">
          বিস্তারিত →
        </Link>
      </div>

      <Link
        to="/shared-channels"
        className="block rounded-2xl bg-primary/10 p-4 transition hover:bg-primary/15"
      >
        <div className="text-[11px] text-muted-foreground">নিট লাভ (খরচ বাদে)</div>
        <div className="mt-1 text-2xl font-black text-primary">
          {summary.isLoading ? "…" : taka(totals.net)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md bg-background/60 px-2 py-1.5">
            <div className="text-muted-foreground">মোট ইনকাম</div>
            <div className="font-semibold text-success">{taka(totals.income)}</div>
          </div>
          <div className="rounded-md bg-background/60 px-2 py-1.5">
            <div className="text-muted-foreground">ভাগ বকেয়া</div>
            <div className="font-semibold">{taka(totalDue)}</div>
          </div>
        </div>
      </Link>

      <button

        type="button"
        onClick={() => setExpenseOpen(true)}
        className="mt-3 flex w-full items-center justify-between rounded-2xl border bg-background px-3 py-2.5 text-xs transition hover:bg-accent/50"
      >
        <span className="flex items-center gap-2 font-medium">
          <ReceiptText className="h-4 w-4 text-primary" /> এই মাসের মোট খরচ
        </span>
        <span className="font-bold text-destructive">
          {monthExpense.isLoading ? "…" : taka(monthExpense.data?.total ?? 0)}
        </span>
      </button>

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>এই মাসের খরচ বিস্তারিত</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(monthExpense.data?.channels ?? []).length === 0 && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                এই মাসে শেয়ার চ্যানেলের কোনো খরচ নেই
              </div>
            )}
            {(monthExpense.data?.channels ?? []).map((c) => (
              <div key={c.name} className="rounded-xl border bg-background p-3 text-xs">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">{c.name}</span>
                  <span className="font-bold text-destructive">{taka(c.total)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md bg-muted/60 px-2 py-1.5">
                    <div className="text-muted-foreground">হাজিরা ({toBn(c.days)} দিন)</div>
                    <div className="font-semibold">{taka(c.attendance)}</div>
                  </div>
                  <div className="rounded-md bg-muted/60 px-2 py-1.5">
                    <div className="text-muted-foreground">অন্যান্য ({toBn(c.otherCount)} টি)</div>
                    <div className="font-semibold">{taka(c.other)}</div>
                  </div>
                </div>
              </div>
            ))}
            {(monthExpense.data?.channels ?? []).length > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2.5 text-xs">
                <span className="font-semibold">মোট খরচ</span>
                <span className="font-black text-destructive">{taka(monthExpense.data?.total ?? 0)}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)}>
              বন্ধ করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {dues.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {dues.slice(0, 3).map((r) => (
            <li
              key={r.partner_id}
              className="flex items-center justify-between rounded-xl border bg-background px-3 py-2 text-xs"
            >
              <span className="truncate font-medium">{r.partner_name}</span>
              <span className="font-bold text-destructive">{taka(r.due)}</span>
            </li>
          ))}
        </ul>
      )}

      {!summary.isLoading && rows.length === 0 && (
        <div className="mt-3 py-2 text-center text-[11px] text-muted-foreground">
          কোনো শেয়ার চ্যানেল নেই
        </div>
      )}
    </section>
  );
}


const BN_MONTHS = [
  "জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন",
  "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর",
];

type ShootingLite = { id: string; name: string; shoot_date: string };

function TotalCostSection() {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [mode, setMode] = useState<"month" | "last3" | "last6" | "year" | "all" | "shooting">("month");
  const [month, setMonth] = useState<string>(currentMonth);
  const [shootingId, setShootingId] = useState<string>("");
  const [showExtras, setShowExtras] = useState(false);

  const shootings = useQuery({
    queryKey: ["all-shootings-for-cost"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date")
        .order("shoot_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShootingLite[];
    },
  });

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    const year = now.getFullYear();
    for (let m = 1; m <= 12; m++) {
      set.add(`${year}-${String(m).padStart(2, "0")}`);
    }
    (shootings.data ?? []).forEach((s) => set.add(s.shoot_date.slice(0, 7)));
    set.add(currentMonth);
    return Array.from(set).sort().reverse();
  }, [shootings.data, currentMonth, now]);

  const filteredIds = useMemo(() => {
    const list = shootings.data ?? [];
    if (mode === "all") return list.map((s) => s.id);
    if (mode === "shooting") return shootingId ? [shootingId] : [];
    if (mode === "month") return list.filter((s) => s.shoot_date.startsWith(month)).map((s) => s.id);
    // range modes: last3 / last6 / year
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0); // end of current month
    let start: Date;
    if (mode === "year") start = new Date(now.getFullYear(), 0, 1);
    else if (mode === "last6") start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    else start = new Date(now.getFullYear(), now.getMonth() - 2, 1); // last3
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    return list.filter((s) => s.shoot_date >= startStr && s.shoot_date <= endStr).map((s) => s.id);
  }, [mode, month, shootingId, shootings.data, now]);

  const totals = useQuery({
    queryKey: ["total-cost", filteredIds.join(",")],
    enabled: filteredIds.length > 0,
    queryFn: async () => {
      const rows = await Promise.all(
        filteredIds.map(async (id) => {
          const { data } = await supabase.rpc("shooting_summary", { _shooting_id: id });
          const row = (data as { total_cost?: number; attendance_cost?: number; extra_cost?: number }[] | null)?.[0];
          return {
            total: Number(row?.total_cost ?? 0),
            att: Number(row?.attendance_cost ?? 0),
            extra: Number(row?.extra_cost ?? 0),
          };
        }),
      );
      return rows.reduce(
        (acc, r) => ({ total: acc.total + r.total, att: acc.att + r.att, extra: acc.extra + r.extra }),
        { total: 0, att: 0, extra: 0 },
      );
    },
  });

  const extras = useQuery({
    queryKey: ["extra-cost-list", filteredIds.join(",")],
    enabled: showExtras && filteredIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shooting_expenses")
        .select("id, amount, note, spent_at, shooting:shootings(name, shoot_date)")
        .in("shooting_id", filteredIds)
        .order("spent_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; amount: number; note: string | null; spent_at: string;
        shooting: { name: string; shoot_date: string } | null;
      }>;
    },
  });

  const labelForMonth = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return `${BN_MONTHS[mm - 1]} ${toBn(String(y))}`;
  };

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <TrendingUp className="h-4 w-4 text-primary" /> মোট খরচ
        </h2>
        <AddExpenseButton shootings={shootings.data ?? []} />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="month">মাস অনুযায়ী</SelectItem>
            <SelectItem value="last3">শেষ ৩ মাস</SelectItem>
            <SelectItem value="last6">শেষ ৬ মাস</SelectItem>
            <SelectItem value="year">এ বছর (১২ মাস)</SelectItem>
            <SelectItem value="all">সব সময়</SelectItem>
            <SelectItem value="shooting">শুটিং অনুযায়ী</SelectItem>
          </SelectContent>
        </Select>
        {mode === "month" && (
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map((m) => (
                <SelectItem key={m} value={m}>{labelForMonth(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {mode === "shooting" && (
          <Select value={shootingId} onValueChange={setShootingId}>
            <SelectTrigger><SelectValue placeholder="শুটিং নির্বাচন" /></SelectTrigger>
            <SelectContent>
              {(shootings.data ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name} — {bnDate(s.shoot_date)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="rounded-2xl bg-primary/10 p-4">
        <div className="text-[11px] text-muted-foreground">মোট খরচ</div>
        <div className="mt-1 text-2xl font-black text-primary">
          {totals.isLoading ? "…" : taka(totals.data?.total ?? 0)}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md bg-background/60 px-2 py-1.5">
            <div className="text-muted-foreground">হাজিরা খরচ</div>
            <div className="font-semibold">{taka(totals.data?.att ?? 0)}</div>
          </div>
          <button
            type="button"
            onClick={() => setShowExtras(true)}
            className="rounded-md bg-background/60 px-2 py-1.5 text-left transition hover:bg-background/80"
          >
            <div className="text-muted-foreground">অন্যান্য খরচ</div>
            <div className="font-semibold">{taka(totals.data?.extra ?? 0)}</div>
            <div className="mt-0.5 text-[10px] text-primary">বিস্তারিত দেখুন →</div>
          </button>
        </div>
        <div className="mt-2 text-[10.5px] text-muted-foreground">
          {toBn(filteredIds.length)} টি শুটিং অন্তর্ভুক্ত
        </div>
      </div>

      <Dialog open={showExtras} onOpenChange={setShowExtras}>
        <DialogContent className="max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>অন্যান্য (অতিরিক্ত) খরচ — বিস্তারিত</DialogTitle>
          </DialogHeader>
          <div className="-mx-2 max-h-[65vh] overflow-y-auto px-2">
            {extras.isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">লোড হচ্ছে…</div>
            ) : (extras.data?.length ?? 0) === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">কোনো অতিরিক্ত খরচ নেই</div>
            ) : (
              (() => {
                const groups = new Map<string, { name: string; items: typeof extras.data; subtotal: number }>();
                for (const e of extras.data!) {
                  const key = e.shooting?.name ?? "—";
                  const g = groups.get(key) ?? { name: key, items: [] as typeof extras.data, subtotal: 0 };
                  g.items!.push(e);
                  g.subtotal += Number(e.amount) || 0;
                  groups.set(key, g);
                }
                return (
                  <ul className="space-y-3">
                    {Array.from(groups.values()).map((g) => (
                      <li key={g.name} className="rounded-xl border border-border/60 bg-background/60 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="truncate text-sm font-bold">{g.name}</div>
                          <div className="shrink-0 text-sm font-bold text-primary">{taka(g.subtotal)}</div>
                        </div>
                        <ol className="space-y-1.5">
                          {g.items!.map((e, i) => (
                            <li key={e.id} className="flex items-start justify-between gap-3 border-t border-border/40 pt-1.5 text-xs">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                  <span className="font-semibold text-foreground">{toBn(String(i + 1))}.</span>
                                  <span>{bnDate(e.spent_at)}</span>
                                </div>
                                {e.note && <div className="mt-0.5 text-foreground/80">{e.note}</div>}
                              </div>
                              <div className="shrink-0 font-semibold text-primary">{taka(e.amount)}</div>
                            </li>
                          ))}
                        </ol>
                      </li>
                    ))}
                  </ul>
                );
              })()
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border/60 pt-3 text-sm">
            <span className="text-muted-foreground">মোট</span>
            <span className="font-bold text-primary">{taka(totals.data?.extra ?? 0)}</span>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AddExpenseButton({ shootings }: { shootings: ShootingLite[] }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [shootingId, setShootingId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const sorted = useMemo(
    () => [...shootings].sort((a, b) => b.shoot_date.localeCompare(a.shoot_date)),
    [shootings],
  );

  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      if (!shootingId) throw new Error("শুটিং নির্বাচন করুন");
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("সঠিক পরিমাণ দিন");
      const { error } = await supabase.from("shooting_expenses").insert({
        owner_id: u.user.id,
        shooting_id: shootingId,
        amount: amt,
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["total-cost"] });
      qc.invalidateQueries({ queryKey: ["extra-cost-list"] });
      qc.invalidateQueries({ queryKey: ["dashboard-shooting-totals"] });
      qc.invalidateQueries({ queryKey: ["shooting-summaries"] });
      toast.success("খরচ যোগ হয়েছে");
      setAmount(""); setNote("");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 gap-1 rounded-full px-3 text-xs"
      >
        <Plus className="h-3.5 w-3.5" /> খরচ যোগ
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>অতিরিক্ত খরচ যোগ</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">শুটিং</Label>
              <Select value={shootingId} onValueChange={setShootingId}>
                <SelectTrigger><SelectValue placeholder="শুটিং নির্বাচন করুন" /></SelectTrigger>
                <SelectContent className="max-h-[40vh]">
                  {sorted.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — {bnDate(s.shoot_date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {shootingId && (
              <div className="space-y-3 rounded-2xl border border-border/60 bg-background/60 p-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">পরিমাণ (৳)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="যেমন: ৫০০"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">নোট (ঐচ্ছিক)</Label>
                  <Input
                    placeholder="যেমন: নাস্তা, খাবার, যাতায়াত"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>বাতিল</Button>
            <Button onClick={() => add.mutate()} disabled={add.isPending || !shootingId}>
              {add.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type DuesMember = {
  id: string;
  name: string;
  photo_url: string | null;
  phone: string | null;
  balance: number;
  lastAmount: number | null;
  lastDate: string | null;
  share_token: string | null;
  share_enabled: boolean;
};

type PayMethod = "cash" | "bkash" | "nagad" | "rocket" | "upay" | "bank";

const METHOD_LABEL: Record<PayMethod, string> = {
  cash: "ক্যাশ",
  bkash: "বিকাশ",
  nagad: "নগদ",
  rocket: "রকেট",
  upay: "উপায়",
  bank: "ব্যাংক",
};

function genShareToken() {
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/[+/=]/g, "").slice(0, 22);
}


function bnTaka(n: number) {
  return toBn(Math.round(n).toLocaleString("en-IN"));
}

function DuesDialog() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"due" | "paid">("due");
  const [sendingId, setSendingId] = useState<string | null>(null);
  const sendSms = useServerFn(sendBulkSmsToMembers);
  const checkBalance = useServerFn(getBulkSmsBalance);
  const qc = useQueryClient();
  const [payTarget, setPayTarget] = useState<DuesMember | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PayMethod>("cash");
  const [payAcct, setPayAcct] = useState("");
  const [payNote, setPayNote] = useState("");

  const { data: payAccounts = [] } = useQuery({
    queryKey: ["member_accounts", payTarget?.id],
    enabled: !!payTarget?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_accounts")
        .select("id, kind, bank_name, branch, account_holder, account_number")
        .eq("member_id", payTarget!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as { id: string; kind: AccountKind; bank_name: string | null; branch: string | null; account_holder: string | null; account_number: string }[];
    },
  });

  // Auto-fill account number when method matches a saved member account
  useEffect(() => {
    if (payMethod === "cash") { setPayAcct(""); return; }
    setPayAcct((prev) => {
      if (prev && payAccounts.some((a) => a.kind === payMethod && a.account_number === prev)) return prev;
      const match = payAccounts.find((a) => a.kind === payMethod);
      return match ? match.account_number : "";
    });
  }, [payMethod, payAccounts]);

  function openPay(r: DuesMember) {
    setPayTarget(r);
    setPayAmount(r.balance > 0 ? String(Math.round(r.balance)) : "");
    setPayMethod("cash");
    setPayAcct("");
    setPayNote("");
  }

  const savePay = useMutation({
    mutationFn: async () => {
      if (!payTarget) throw new Error("সদস্য নির্বাচন করুন");
      const amt = Number(payAmount);
      if (!amt || amt <= 0) throw new Error("সঠিক পরিমাণ দিন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const { error } = await supabase.from("payments").insert({
        owner_id: u.user.id,
        member_id: payTarget.id,
        amount: amt,
        note: payNote.trim() || null,
        method: payMethod,
        bank_account_number: payMethod !== "cash" && payAcct.trim() ? payAcct.trim() : null,
      });
      if (error) throw error;
      if (payMethod !== "cash" && payAcct.trim()) {
        await saveMemberAccountIfNew({
          ownerId: u.user.id,
          memberId: payTarget.id,
          memberName: payTarget.name,
          method: payMethod,
          accountNumber: payAcct,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["member_accounts"] });
      qc.invalidateQueries({ queryKey: ["dues-breakdown"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      toast.success(`পেমেন্ট সংরক্ষিত — ${payTarget?.name ?? ""}`);
      setPayTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleCheckBalance() {
    try {
      const res = await checkBalance();
      toast.message(`Sender: ${res.senderId || "-"}`, { description: res.raw });
    } catch (e: any) {
      toast.error(e?.message || "Balance check failed");
    }
  }

  const dues = useQuery({
    queryKey: ["dues-breakdown"],
    enabled: open,
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("members")
        .select("id, name, photo_url, phone, share_token, share_enabled")
        .order("name");
      if (error) throw error;
      const rows = await Promise.all(
        (members ?? []).map(async (m) => {
          const [{ data: bal }, { data: lastPay }] = await Promise.all([
            supabase.rpc("member_balance", { _member_id: m.id }),
            supabase
              .from("payments")
              .select("amount, paid_at")
              .eq("member_id", m.id)
              .order("paid_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);
          return {
            ...m,
            balance: Number(bal ?? 0),
            lastAmount: lastPay ? Number(lastPay.amount) : null,
            lastDate: lastPay?.paid_at ?? null,
          } as DuesMember;
        }),
      );
      // Pre-warm share tokens so WhatsApp/SMS buttons can open synchronously (no blank tab)
      const needsToken = rows.filter((r) => !r.share_token || !r.share_enabled);
      if (needsToken.length > 0) {
        await Promise.all(
          needsToken.map(async (r) => {
            const token = r.share_token ?? genShareToken();
            const { error: upErr } = await supabase
              .from("members")
              .update({ share_token: token, share_enabled: true })
              .eq("id", r.id);
            if (!upErr) {
              r.share_token = token;
              r.share_enabled = true;
            }
          }),
        );
      }
      return rows;
    },
  });

  const all = dues.data ?? [];
  const dueRows = all.filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance);
  const paidRows = all.filter((r) => r.balance <= 0).sort((a, b) => a.name.localeCompare(b.name, "bn"));
  const rows = tab === "due" ? dueRows : paidRows;
  const total = dueRows.reduce((s, r) => s + r.balance, 0);

  async function ensureShareLink(r: DuesMember): Promise<string> {
    let token = r.share_token;
    let enabled = r.share_enabled;
    if (!token || !enabled) {
      const patch: { share_token?: string; share_enabled: boolean } = { share_enabled: true };
      if (!token) {
        token = genShareToken();
        patch.share_token = token;
      }
      const { error } = await supabase.from("members").update(patch).eq("id", r.id);
      if (error) throw error;
      r.share_token = token;
      r.share_enabled = true;
    }
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/p/${r.id}?t=${token}`;
  }

  function buildMessage(r: DuesMember, link: string) {
    if (r.balance > 0) {
      const lastPart =
        r.lastAmount && r.lastDate
          ? `সর্বশেষ পেমেন্ট: ${bnTaka(r.lastAmount)} টাকা, তারিখ ${bnDate(r.lastDate)}।`
          : "এখনো কোনো পেমেন্ট জমা হয়নি।";
      return `প্রিয় ${r.name}, কুয়াকাটা মাল্টিমিডিয়াতে আপনার বকেয়া ${bnTaka(r.balance)} টাকা। ${lastPart} বিস্তারিত: ${link} - কুয়াকাটা মাল্টিমিডিয়া ফাইন্যান্স`;
    }
    return `প্রিয় ${r.name}, কুয়াকাটা মাল্টিমিডিয়াতে আপনার সকল ব্যালেন্স পেইড। বর্তমান ব্যালেন্স: ০ টাকা। ধন্যবাদ। বিস্তারিত: ${link} - কুয়াকাটা মাল্টিমিডিয়া ফাইন্যান্স`;
  }

  function normalizeWhatsappPhone(phone: string) {
    const digits = phone.replace(/\D/g, "");
    if (digits.startsWith("8801") && digits.length >= 13) return digits;
    if (digits.startsWith("01") && digits.length >= 11) return `88${digits}`;
    if (digits.startsWith("1") && digits.length >= 10) return `880${digits}`;
    return digits;
  }

  async function handleSendSms(r: DuesMember) {
    if (!r.phone) {
      toast.error("মোবাইল নাম্বার নেই");
      return;
    }
    setSendingId(r.id);
    try {
      const link = await ensureShareLink(r);
      const message = buildMessage(r, link);
      const res = await sendSms({ data: { memberIds: [r.id], message } });
      if (res.sent > 0) toast.success(`SMS পাঠানো হয়েছে — ${r.name}`);
      else toast.error(res.results?.[0]?.error || "SMS পাঠানো যায়নি");
    } catch (e: any) {
      toast.error(e?.message || "SMS পাঠানো যায়নি");
    } finally {
      setSendingId(null);
    }
  }

  async function handleSendWhatsApp(r: DuesMember) {
    if (!r.phone) {
      toast.error("মোবাইল নাম্বার নেই");
      return;
    }
    const digits = normalizeWhatsappPhone(r.phone);
    if (!digits.startsWith("8801")) {
      toast.error("WhatsApp নাম্বার সঠিক নয়");
      return;
    }
    try {
      // If share link is already ready, open synchronously (no blank intermediate tab)
      if (r.share_token && r.share_enabled) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const link = `${origin}/p/${r.id}?t=${r.share_token}`;
        const url = `https://wa.me/${digits}?text=${encodeURIComponent(buildMessage(r, link))}`;
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }
      // First-time: generate the token, then navigate the same tab so WhatsApp opens directly
      const link = await ensureShareLink(r);
      const url = `https://wa.me/${digits}?text=${encodeURIComponent(buildMessage(r, link))}`;
      window.location.href = url;
    } catch (e: any) {
      toast.error(e?.message || "লিংক তৈরি করা যায়নি");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold text-primary-foreground backdrop-blur-sm transition hover:bg-white/25"
      >
        <Users className="h-3.5 w-3.5" /> বকেয়া তালিকা
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="no-print border-b border-border/60 px-5 pb-3 pt-5">
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> সদস্য হিসাব তালিকা</span>
              <button type="button" onClick={handleCheckBalance} className="rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted">SMS Balance</button>
            </DialogTitle>
            <div className="mt-3 inline-flex rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTab("due")}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${tab === "due" ? "bg-background shadow-sm text-primary" : "text-muted-foreground"}`}
              >
                বকেয়া ({toBn(dueRows.length)})
              </button>
              <button
                type="button"
                onClick={() => setTab("paid")}
                className={`rounded-md px-3 py-1.5 font-semibold transition ${tab === "paid" ? "bg-background shadow-sm text-emerald-600" : "text-muted-foreground"}`}
              >
                পেইড ({toBn(paidRows.length)})
              </button>
            </div>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto px-5 py-3">
            <div id="print-area" className="space-y-3 text-sm">
              <div className="border-b pb-2 text-center">
                <h2 className="text-lg font-bold">
                  Kuakata Multimedia Finance — {tab === "due" ? "বকেয়া" : "পরিশোধিত"} সদস্য তালিকা
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">তৈরি: {bnDate(new Date())}</p>
              </div>

              {dues.isLoading && <div className="py-6 text-center text-muted-foreground">লোড হচ্ছে…</div>}

              {!dues.isLoading && rows.length === 0 && (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  {tab === "due" ? "কোনো সদস্যের বকেয়া নেই 🎉" : "কোনো পরিশোধিত সদস্য নেই"}
                </div>
              )}

              {rows.length > 0 && (
                <>
                  {/* Mobile card view */}
                  <div className="space-y-2 md:hidden">
                    {rows.map((r, i) => (
                      <div
                        key={r.id}
                        className="rounded-lg border border-border/60 bg-card/60 p-3 shadow-sm"
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                            {toBn(String(i + 1))}
                          </div>
                          <MemberAvatar name={r.name} photoUrl={r.photo_url} size="sm" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold">{r.name}</div>
                            <div className="truncate text-[11px] text-muted-foreground">
                              {r.phone ? toBn(r.phone) : "মোবাইল নেই"}
                            </div>
                          </div>
                          <div
                            className={`shrink-0 text-right text-sm font-black ${tab === "due" ? "text-primary" : "text-emerald-600"}`}
                          >
                            {tab === "due" ? taka(r.balance) : "৳ ০"}
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/40 pt-2">
                          <div className="min-w-0 text-[11px] text-muted-foreground">
                            {r.lastAmount && r.lastDate ? (
                              <>
                                <span className="font-semibold text-foreground">{taka(r.lastAmount)}</span>
                                <span className="mx-1">·</span>
                                <span>{bnDate(r.lastDate)}</span>
                              </>
                            ) : (
                              <span>শেষ পেমেন্ট নেই</span>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            className="h-8 shrink-0 gap-1 bg-primary px-2.5 text-[11px] text-primary-foreground hover:bg-primary/90 no-print"
                            onClick={() => openPay(r)}
                          >
                            <Wallet className="h-3 w-3" />
                            পেমেন্ট
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0 gap-1 border-emerald-500/40 bg-emerald-500/10 px-2.5 text-[11px] text-emerald-700 hover:bg-emerald-500/20 no-print"
                            disabled={!r.phone}
                            onClick={() => handleSendWhatsApp(r)}
                            title="WhatsApp এ পাঠান"
                          >
                            <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden><path d="M20.52 3.48A11.93 11.93 0 0 0 12.04 0C5.5 0 .17 5.33.17 11.87c0 2.09.55 4.13 1.6 5.93L0 24l6.34-1.66a11.86 11.86 0 0 0 5.7 1.45h.01c6.54 0 11.87-5.33 11.87-11.87 0-3.17-1.24-6.15-3.4-8.44ZM12.05 21.3h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.76.99 1-3.67-.22-.38a9.42 9.42 0 1 1 8.12 4.57Zm5.43-7.05c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.18.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47 0 1.46 1.07 2.86 1.22 3.06.15.2 2.1 3.2 5.08 4.48.71.31 1.27.49 1.7.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z"/></svg>
                            WA
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 shrink-0 gap-1 px-2.5 text-[11px] no-print"
                            disabled={sendingId === r.id || !r.phone}
                            onClick={() => handleSendSms(r)}
                          >
                            {sendingId === r.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <MessageSquare className="h-3 w-3" />
                            )}
                            SMS
                          </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {tab === "due" && (
                      <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-2">
                        <span className="text-xs font-bold">
                          মোট বকেয়া ({toBn(dueRows.length)} জন)
                        </span>
                        <span className="text-base font-black text-primary">{taka(total)}</span>
                      </div>
                    )}
                  </div>

                  {/* Desktop table view */}
                  <div className="hidden overflow-x-auto md:block">
                    <table className="w-full border-collapse text-[12px]">
                      <thead>
                        <tr className="bg-muted/60">
                          <th className="border px-2 py-1.5 text-left font-semibold">#</th>
                          <th className="border px-2 py-1.5 text-left font-semibold">সদস্য</th>
                          <th className="border px-2 py-1.5 text-left font-semibold">মোবাইল</th>
                          <th className="border px-2 py-1.5 text-left font-semibold">শেষ পেমেন্ট</th>
                          <th className="border px-2 py-1.5 text-right font-semibold">
                            {tab === "due" ? "বকেয়া" : "ব্যালেন্স"}
                          </th>
                          <th className="border px-2 py-1.5 text-center font-semibold no-print">অ্যাকশন</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={r.id} className="even:bg-muted/20">
                            <td className="border px-2 py-1.5">{toBn(String(i + 1))}</td>
                            <td className="border px-2 py-1.5">
                              <div className="flex items-center gap-2">
                                <MemberAvatar name={r.name} photoUrl={r.photo_url} size="sm" />
                                <span className="font-medium">{r.name}</span>
                              </div>
                            </td>
                            <td className="border px-2 py-1.5 text-muted-foreground">{r.phone ? toBn(r.phone) : "—"}</td>
                            <td className="border px-2 py-1.5 text-[11px] text-muted-foreground">
                              {r.lastAmount && r.lastDate ? (
                                <>
                                  <div className="font-semibold text-foreground">{taka(r.lastAmount)}</div>
                                  <div>{bnDate(r.lastDate)}</div>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td
                              className={`border px-2 py-1.5 text-right font-bold ${tab === "due" ? "text-primary" : "text-emerald-600"}`}
                            >
                              {tab === "due" ? taka(r.balance) : "৳ ০"}
                            </td>
                            <td className="border px-2 py-1 text-center no-print">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 gap-1 bg-primary px-2 text-[11px] text-primary-foreground hover:bg-primary/90"
                                  onClick={() => openPay(r)}
                                >
                                  <Wallet className="h-3 w-3" />
                                  পেমেন্ট
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 border-emerald-500/40 bg-emerald-500/10 px-2 text-[11px] text-emerald-700 hover:bg-emerald-500/20"
                                  disabled={!r.phone}
                                  onClick={() => handleSendWhatsApp(r)}
                                  title="WhatsApp এ পাঠান"
                                >
                                  <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden><path d="M20.52 3.48A11.93 11.93 0 0 0 12.04 0C5.5 0 .17 5.33.17 11.87c0 2.09.55 4.13 1.6 5.93L0 24l6.34-1.66a11.86 11.86 0 0 0 5.7 1.45h.01c6.54 0 11.87-5.33 11.87-11.87 0-3.17-1.24-6.15-3.4-8.44ZM12.05 21.3h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.76.99 1-3.67-.22-.38a9.42 9.42 0 1 1 8.12 4.57Zm5.43-7.05c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.18.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47 0 1.46 1.07 2.86 1.22 3.06.15.2 2.1 3.2 5.08 4.48.71.31 1.27.49 1.7.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z"/></svg>
                                  WA
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 px-2 text-[11px]"
                                  disabled={sendingId === r.id || !r.phone}
                                  onClick={() => handleSendSms(r)}
                                >
                                  {sendingId === r.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <MessageSquare className="h-3 w-3" />
                                  )}
                                  SMS
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      {tab === "due" && (
                        <tfoot>
                          <tr className="bg-primary/10">
                            <td className="border px-2 py-2 font-bold" colSpan={4}>
                              মোট বকেয়া ({toBn(dueRows.length)} জন)
                            </td>
                            <td className="border px-2 py-2 text-right text-base font-black text-primary">{taka(total)}</td>
                            <td className="border no-print" />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </>
              )}

            </div>
          </div>

          <DialogFooter className="no-print border-t border-border/60 px-5 py-3">
            <Button variant="outline" onClick={() => setOpen(false)}>
              বন্ধ
            </Button>
            <Button onClick={() => window.print()} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> PDF ডাউনলোড
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payTarget} onOpenChange={(o) => { if (!o) setPayTarget(null); }}>
        <DialogContent className="max-w-sm p-0">
          <DialogHeader className="border-b border-border/60 px-5 py-3">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" /> পেমেন্ট — {payTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4">
            {payTarget && (
              <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2 text-sm">
                <span className="text-muted-foreground">বর্তমান বকেয়া</span>
                <b className="text-primary">{taka(payTarget.balance)}</b>
              </div>
            )}
            {payAccounts.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-muted-foreground">সংরক্ষিত পেমেন্ট অ্যাকাউন্ট</div>
                <ul className="space-y-1.5">
                  {payAccounts.map((a) => (
                    <li key={a.id} className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                        {a.kind === "bank" ? <Landmark className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="font-medium">
                          {ACCOUNT_KIND_LABEL[a.kind]}
                          {a.kind === "bank" && a.bank_name ? ` — ${a.bank_name}` : ""}
                        </div>
                        <div className="font-mono text-sm break-all">{a.account_number}</div>
                        {(a.account_holder || a.branch) && (
                          <div className="text-muted-foreground">
                            {a.account_holder}{a.account_holder && a.branch ? " • " : ""}{a.branch}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px]"
                        onClick={() => { setPayMethod(a.kind as PayMethod); setPayAcct(a.account_number); }}
                      >
                        ব্যবহার
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">পরিমাণ</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">পেমেন্ট মাধ্যম</Label>
              <Select value={payMethod} onValueChange={(v) => setPayMethod(v as PayMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
                    <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {payMethod !== "cash" && (
              <div className="space-y-1.5">
                <Label className="text-xs">{payMethod === "bank" ? "ব্যাংক অ্যাকাউন্ট নম্বর (ঐচ্ছিক)" : "নম্বর (ঐচ্ছিক)"}</Label>
                <Input
                  type="tel"
                  inputMode="numeric"
                  value={payAcct}
                  onChange={(e) => setPayAcct(e.target.value.replace(/[^0-9]/g, ""))}
                  placeholder={payMethod === "bank" ? "অ্যাকাউন্ট নম্বর" : "01XXXXXXXXX"}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">নোট (ঐচ্ছিক)</Label>
              <Input value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="যেমন: অগ্রিম, বকেয়া" />
            </div>
          </div>
          <DialogFooter className="border-t border-border/60 px-5 py-3">
            <Button variant="outline" onClick={() => setPayTarget(null)}>বাতিল</Button>
            <Button onClick={() => savePay.mutate()} disabled={savePay.isPending}>
              {savePay.isPending ? "সংরক্ষণ হচ্ছে…" : "পেমেন্ট সংরক্ষণ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


type BreakdownRow = { id: string; name: string; photo_url: string | null; prev: number; curr: number; total: number };

function DueBreakdownDialog({
  which,
  title,
  rows,
  total,
  loading,
}: {
  which: "prev" | "curr";
  title: string;
  rows: BreakdownRow[];
  total: number;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const filtered = rows
    .map((r) => ({ ...r, amount: which === "prev" ? r.prev : r.curr }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-white/15 px-3 py-2 text-left backdrop-blur-sm transition hover:bg-white/25"
      >
        <div className="text-[10px] text-primary-foreground/80">{title}</div>
        <div className="text-sm font-bold text-primary-foreground">{loading ? "…" : taka(total)}</div>
      </button>
      <DialogContent className="max-w-md p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-3">
          <DialogTitle className="flex items-center justify-between text-base">
            <span>{title}</span>
            <span className="text-primary">{taka(total)}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] overflow-y-auto p-3">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">কোনো বকেয়া নেই</div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 rounded-xl border bg-background p-2.5">
                  <span className="w-5 shrink-0 text-center text-[10px] text-muted-foreground">{toBn(i + 1)}.</span>
                  <MemberAvatar name={r.name} photoUrl={r.photo_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      মোট বকেয়া: {taka(Math.max(0, r.total))}
                    </div>
                  </div>
                  <div className="text-sm font-bold text-destructive">{taka(r.amount)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter className="border-t border-border/60 px-5 py-3">
          <Button variant="outline" onClick={() => setOpen(false)}>বন্ধ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const BN_DIGITS = ["০","১","২","৩","৪","৫","৬","৭","৮","৯"];
const bnNum = (n: number | string) => String(n).replace(/\d/g, (d) => BN_DIGITS[+d]);

function weatherInfo(code: number): { label: string; emoji: string; rainy: boolean } {
  if ([0].includes(code)) return { label: "পরিষ্কার আকাশ", emoji: "☀️", rainy: false };
  if ([1, 2].includes(code)) return { label: "আংশিক মেঘলা", emoji: "🌤️", rainy: false };
  if ([3].includes(code)) return { label: "মেঘলা আকাশ", emoji: "☁️", rainy: false };
  if ([45, 48].includes(code)) return { label: "কুয়াশাচ্ছন্ন", emoji: "🌫️", rainy: false };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: "গুঁড়ি গুঁড়ি বৃষ্টি", emoji: "🌦️", rainy: true };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: "বৃষ্টি হতে পারে", emoji: "🌧️", rainy: true };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "তুষারপাত", emoji: "🌨️", rainy: false };
  if ([95, 96, 99].includes(code)) return { label: "বজ্রসহ বৃষ্টি", emoji: "⛈️", rainy: true };
  return { label: "আবহাওয়া স্বাভাবিক", emoji: "🌤️", rainy: false };
}

function WeatherLine() {
  const { data } = useQuery({
    queryKey: ["weather-kuakata"],
    queryFn: async () => {
      const url = "https://api.open-meteo.com/v1/forecast?latitude=21.81755&longitude=90.138884&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Asia%2FDhaka&forecast_days=1";
      const res = await fetch(url);
      if (!res.ok) throw new Error("weather failed");
      return res.json() as Promise<{
        current: { temperature_2m: number; weather_code: number };
        daily: { weather_code: number[]; temperature_2m_max: number[]; temperature_2m_min: number[]; precipitation_probability_max: number[] };
      }>;
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  if (!data) return null;
  const temp = Math.round(data.current.temperature_2m);
  const info = weatherInfo(data.daily.weather_code?.[0] ?? data.current.weather_code);
  const rainProb = data.daily.precipitation_probability_max?.[0] ?? 0;
  const tMax = Math.round(data.daily.temperature_2m_max?.[0] ?? temp);
  const tMin = Math.round(data.daily.temperature_2m_min?.[0] ?? temp);

  const rainMsg = info.rainy
    ? `আজ বৃষ্টি হওয়ার সম্ভাবনা রয়েছে (${bnNum(rainProb)}%)`
    : rainProb >= 40
      ? `আজ হালকা বৃষ্টি হতে পারে (${bnNum(rainProb)}%)`
      : "আজ বৃষ্টি হওয়ার সম্ভাবনা কম";

  return (
    <div className="mt-1.5 flex flex-col items-center gap-0.5 text-xs text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <span>{info.emoji}</span>
        <span>আজ {info.label} · তাপমাত্রা {bnNum(temp)}°C</span>
      </div>
      <div className="text-[11px]">
        সর্বোচ্চ {bnNum(tMax)}° / সর্বনিম্ন {bnNum(tMin)}° · {rainMsg}
      </div>
    </div>
  );
}

