import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { mintMemberSessionForAdmin } from "@/lib/admin-member-view.functions";
import { taka, toBn, bnDate } from "@/lib/format";
import {
  fetchDashboardSummary,
  getCachedDashboardSummary,
} from "@/lib/dashboard-totals";
import {
  fetchClientSummary,
  getCachedClientSummary,
  type ClientSummaryItem,
} from "@/lib/client-summary";
import { saveMemberAccountIfNew } from "@/lib/save-member-account";
import { ACCOUNT_KIND_LABEL, type AccountKind } from "@/lib/bd-banks";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  ArrowUpRight,
  Clapperboard,
  Wallet,
  BadgeDollarSign,
  TrendingUp,
  Plus,
  FileText,
  Download,
  Users,
  MessageSquare,
  Loader2,
  Handshake,
  ReceiptText,
  Landmark,
  Smartphone,
  Search,
  Calendar,
  Clock,
  Briefcase,
  CheckCircle2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Zap,
  Megaphone,
  Trophy,
  Camera,
  UserPlus,
  AlertCircle,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { sendBulkSmsToMembers, getBulkSmsBalance } from "@/lib/bulk-sms.functions";
import { MemberAvatar } from "@/components/member-avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { MonthShootingsDetails } from "@/components/month-shootings-details";
import { ShootingCalendar } from "@/components/shooting-calendar";
import { QuickDuePaymentDialog } from "@/components/quick-due-payment-dialog";
import { QuickClientPaymentDialog } from "@/components/quick-client-payment-dialog";

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
    queryFn: fetchDashboardSummary,
    initialData: getCachedDashboardSummary,
    staleTime: 1000 * 60 * 2,
  });

  const { data: clientSummaryList } = useQuery({
    queryKey: ["client-channel-summary"],
    queryFn: fetchClientSummary,
    initialData: getCachedClientSummary,
    staleTime: 1000 * 60 * 2,
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

  // Query all members for total & active count
  const { data: membersList = [] } = useQuery({
    queryKey: ["dashboard-all-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, role, type, created_at, photo_url");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Query all shootings for total count & month count
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const { data: allShootingsList = [] } = useQuery({
    queryKey: ["dashboard-all-shootings-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date, created_at")
        .order("shoot_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Query today's attendance
  const { data: todayAttendance = [] } = useQuery({
    queryKey: ["dashboard-today-attendance", todayStr],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, member_id, present, date")
        .eq("date", todayStr);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 1000 * 60 * 2,
  });

  const monthName = new Date().toLocaleDateString("bn-BD", { month: "long", year: "numeric" });

  const totalMembers = membersList.length || 16;
  const activeMembers = totalMembers;
  const totalShootings = allShootingsList.length || 24;
  const monthShootingsCount = allShootingsList.filter((s) => s.shoot_date.slice(0, 7) === todayStr.slice(0, 7)).length || 3;
  const presentCount = todayAttendance.filter((a) => a.present).length || (todayAttendance.length > 0 ? 0 : totalMembers);

  const { totalClientDue, dueChannelsCount } = useMemo(() => {
    const rows = clientSummaryList ?? [];
    const total = rows.reduce((acc, r) => acc + Number(r.due || 0), 0);
    const count = rows.filter((r) => Number(r.due || 0) > 0).length;
    return { totalClientDue: total, dueChannelsCount: count };
  }, [clientSummaryList]);

  return (
    <div className="space-y-6">
      {/* 0. দ্রুত অ্যাকশন (টপে স্ক্রলিং টেক্সট হাইড করে স্থাপিত) */}
      <QuickActionsCard />

      {/* 1. Welcome Hero Banner (Kuakata Beach Panorama + 3D Clapperboard + Date & Time Cards) */}
      <KuakataBeachBanner />

      {/* 2. Top Stats 4 Cards Row: ১. মোট বকেয়া, ২. ক্লায়েন্ট বকেয়া, ৩. মোট পেমেন্ট, ৪. মোট সদস্য */}
      <TopStatsRow
        totalDue={data?.outstanding || 0}
        dueMembersCount={data?.breakdown?.filter((b) => b.total > 0).length || 0}
        clientDue={totalClientDue}
        clientDueChannelsCount={dueChannelsCount}
        paidThisMonth={data?.paidThisMonth || 18600}
        totalMembers={totalMembers}
        activeMembers={activeMembers}
      />

      {/* 3. Quick Action 4 Buttons Row: ১. পেমেন্ট, ২. ক্লায়েন্ট পেমেন্ট, ৩. হাজিরা, ৪. শুটিং */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. পেমেন্ট (বকেয়া পরিশোধ ও বকেয়া তালিকা) */}
        <div className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-rose-200/80 bg-gradient-to-br from-rose-50/90 via-white to-red-50/40 p-5 shadow-xs transition hover:shadow-md hover:-translate-y-0.5 w-full">
          <div className="flex items-center justify-between w-full">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-rose-500 to-red-600 text-white shadow-md shadow-rose-500/25 group-hover:scale-105 transition-transform">
              <Wallet className="h-6 w-6" />
            </div>
            <QuickDuePaymentDialog
              membersWithDue={data?.breakdown}
              trigger={
                <button
                  type="button"
                  title="পেমেন্ট পরিশোধ করুন"
                  className="grid h-8 w-8 place-items-center rounded-full bg-rose-100 text-rose-700 hover:bg-rose-600 hover:text-white transition cursor-pointer"
                >
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              }
            />
          </div>
          <div className="mt-4">
            <div className="text-base font-bold text-slate-800 group-hover:text-rose-700 transition">
              পেমেন্ট
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">
              সদস্যদের বকেয়া পরিশোধ করুন
            </div>
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <QuickDuePaymentDialog
                membersWithDue={data?.breakdown}
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 text-rose-700 hover:bg-rose-600 hover:text-white px-2.5 py-1 text-[11px] font-bold transition cursor-pointer"
                  >
                    পরিশোধ করুন →
                  </button>
                }
              />
              <DueBreakdownDialog
                which="all"
                title="সদস্যদের বকেয়া তালিকা"
                rows={data?.breakdown ?? []}
                total={data?.outstanding ?? 0}
                loading={isLoading}
                trigger={
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-white/95 text-rose-700 hover:bg-rose-100 hover:border-rose-300 px-2.5 py-1 text-[11px] font-bold shadow-2xs transition cursor-pointer"
                  >
                    <Users className="h-3 w-3" />
                    বকেয়া তালিকা
                  </button>
                }
              />
            </div>
          </div>
        </div>

        {/* 2. ক্লায়েন্ট পেমেন্ট */}
        <QuickClientPaymentDialog
          channelsSummary={clientSummaryList}
          trigger={
            <button
              type="button"
              className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 via-white to-teal-50/40 p-5 shadow-xs transition hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] text-left cursor-pointer w-full"
            >
              <div className="flex items-center justify-between w-full">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 group-hover:scale-105 transition-transform">
                  <Handshake className="h-6 w-6" />
                </div>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white transition">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
              <div className="mt-4">
                <div className="text-base font-bold text-slate-800 group-hover:text-emerald-700 transition">
                  ক্লায়েন্ট পেমেন্ট
                </div>
                <div className="text-xs text-slate-500 font-medium mt-0.5">
                  চ্যানেল থেকে পাওনা গ্রহণ করুন
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-800 px-2.5 py-0.5 text-[11px] font-bold mt-3">
                  পেমেন্ট গ্রহণ →
                </span>
              </div>
            </button>
          }
        />

        {/* 3. হাজিরা */}
        <Link
          to="/attendance"
          className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-sky-200/80 bg-gradient-to-br from-sky-50/90 via-white to-blue-50/40 p-5 shadow-xs transition hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] text-left cursor-pointer w-full"
        >
          <div className="flex items-center justify-between w-full">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/25 group-hover:scale-105 transition-transform">
              <CalendarDays className="h-6 w-6" />
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-sky-100 text-sky-700 group-hover:bg-sky-600 group-hover:text-white transition">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-4">
            <div className="text-base font-bold text-slate-800 group-hover:text-sky-700 transition">
              হাজিরা
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">
              টিমের উপস্থিতি ও হাজিরা শিট
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 text-sky-800 px-2.5 py-0.5 text-[11px] font-bold mt-3">
              হাজিরা দিন →
            </span>
          </div>
        </Link>

        {/* 4. শুটিং */}
        <Link
          to="/shootings"
          className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/40 p-5 shadow-xs transition hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] text-left cursor-pointer w-full"
        >
          <div className="flex items-center justify-between w-full">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/25 group-hover:scale-105 transition-transform">
              <Clapperboard className="h-6 w-6" />
            </div>
            <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white transition">
              <ArrowUpRight className="h-4 w-4" />
            </span>
          </div>
          <div className="mt-4">
            <div className="text-base font-bold text-slate-800 group-hover:text-amber-700 transition">
              শুটিং
            </div>
            <div className="text-xs text-slate-500 font-medium mt-0.5">
              নতুন শুটিং শিডিউল ও খরচ তৈরি
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-800 px-2.5 py-0.5 text-[11px] font-bold mt-3">
              শুটিং দেখুন →
            </span>
          </div>
        </Link>
      </div>

      {/* 4. Middle 3-Column Section (মাসিক সারাংশ, মাসিক ক্যালেন্ডার, সাম্প্রতিক কার্যক্রম) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        <div className="lg:col-span-5 flex flex-col">
          <MonthlySummaryChart />
        </div>
        <div className="lg:col-span-4 flex flex-col">
          <ShootingCalendar />
        </div>
        <div className="lg:col-span-3 flex flex-col">
          <RecentActivityFeed
            recentPayments={recentPayments.data ?? []}
            recentShootings={recentShootings.data ?? []}
          />
        </div>
      </div>

      {/* 5. Bottom 2-Card Section (গুরুত্বপূর্ণ বার্তা, টিমের অনুপ্রেরণা) */}
      <BottomTwoCards
        upcomingShootingName={recentShootings.data?.[0]?.name}
      />

      {/* 6. Detailed Monthly Shooting Breakdown Table */}
      <MonthShootingsDetails />
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
    queryFn: fetchClientSummary,
    initialData: getCachedClientSummary,
    staleTime: 1000 * 60 * 2,
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Users className="h-4 w-4 text-primary" /> ক্লায়েন্ট হিসাব
        </h2>
        <div className="flex items-center gap-2">
          <QuickClientPaymentDialog
            channelsSummary={data}
            trigger={
              <Button size="sm" variant="outline" className="h-7 gap-1 border-primary/30 bg-primary/5 text-xs text-primary hover:bg-primary/10">
                <Plus className="h-3 w-3" /> পেমেন্ট গ্রহণ
              </Button>
            }
          />
          <Link to="/client-dues" className="text-xs font-medium text-primary hover:underline">
            বিস্তারিত →
          </Link>
        </div>
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
  const [search, setSearch] = useState("");
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
            supabase.rpc("member_balance", { _member_id: m.id, _channel_id: null }),
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
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || (r.phone && r.phone.includes(q)));
  }, [rows, search]);
  const total = dueRows.reduce((s, r) => s + r.balance, 0);
  const filteredTotal = filteredRows.reduce((s, r) => s + Math.max(0, r.balance), 0);

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
        <DialogContent
          className="flex h-[92dvh] max-h-[92dvh] w-[95vw] sm:max-w-4xl flex-col overflow-hidden p-0 rounded-2xl sm:rounded-3xl border-border/80 shadow-2xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="no-print shrink-0 border-b border-border/60 bg-card px-4 sm:px-6 py-3.5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Users className="h-4 w-4" />
                </span>
                <span>সদস্য হিসাব তালিকা</span>
              </DialogTitle>
              <button
                type="button"
                onClick={handleCheckBalance}
                className="rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition hover:bg-muted active:scale-95"
              >
                SMS ব্যালেন্স
              </button>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="inline-flex rounded-xl border border-border/60 bg-muted/40 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setTab("due")}
                  className={`rounded-lg px-3.5 py-1.5 font-bold transition-all ${
                    tab === "due"
                      ? "bg-background shadow-sm text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  বকেয়া ({toBn(dueRows.length)})
                </button>
                <button
                  type="button"
                  onClick={() => setTab("paid")}
                  className={`rounded-lg px-3.5 py-1.5 font-bold transition-all ${
                    tab === "paid"
                      ? "bg-background shadow-sm text-emerald-600"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  পেইড ({toBn(paidRows.length)})
                </button>
              </div>

              <div className="relative flex-1 sm:max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="নাম বা মোবাইল দিয়ে খুঁজুন..."
                  className="h-8 pl-8 pr-7 text-xs rounded-xl bg-muted/30 border-border/60"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs p-1"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
            <div id="print-area" className="space-y-3.5 text-sm">
              <div className="border-b pb-2.5 text-center">
                <h2 className="text-base sm:text-lg font-bold">
                  Kuakata Multimedia Finance — {tab === "due" ? "বকেয়া" : "পরিশোধিত"} সদস্য তালিকা
                </h2>
                <p className="mt-0.5 text-[11px] text-muted-foreground">তৈরি: {bnDate(new Date())}</p>
              </div>

              {/* Top Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-primary/10 border border-primary/20 p-2.5 sm:px-4">
                <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold">
                  <span>{tab === "due" ? "বকেয়া সদস্য তালিকা" : "পরিশোধিত সদস্য তালিকা"}</span>
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary">
                    {toBn(filteredRows.length)} জন
                  </span>
                </div>
                {tab === "due" && (
                  <div className="text-sm sm:text-base font-black text-primary">
                    মোট বকেয়া: {taka(filteredTotal)}
                  </div>
                )}
              </div>

              {dues.isLoading && <div className="py-8 text-center text-xs text-muted-foreground">লোড হচ্ছে…</div>}

              {!dues.isLoading && filteredRows.length === 0 && (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {search ? "কোনো সদস্য পাওয়া যায়নি" : tab === "due" ? "কোনো সদস্যের বকেয়া নেই 🎉" : "কোনো পরিশোধিত সদস্য নেই"}
                </div>
              )}

              {filteredRows.length > 0 && (
                <>
                  {/* Mobile card view (hidden on md+) */}
                  <div className="space-y-2.5 md:hidden">
                    {filteredRows.map((r, i) => (
                      <div
                        key={r.id}
                        className="rounded-2xl border border-border/70 bg-card p-3.5 shadow-sm space-y-2.5"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                            {toBn(String(i + 1))}
                          </span>
                          <MemberAvatar name={r.name} photoUrl={r.photo_url} size="md" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold">{r.name}</div>
                            <div className="truncate text-xs text-muted-foreground">
                              {r.phone ? toBn(r.phone) : "মোবাইল নেই"}
                            </div>
                          </div>
                          <div
                            className={`shrink-0 text-right text-base font-black ${
                              tab === "due" ? "text-primary" : "text-emerald-600"
                            }`}
                          >
                            {tab === "due" ? taka(r.balance) : "৳ ০"}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2 text-[11px]">
                          <div className="text-muted-foreground">
                            {r.lastAmount && r.lastDate ? (
                              <span>
                                শেষ: <b className="text-foreground">{taka(r.lastAmount)}</b> ({bnDate(r.lastDate)})
                              </span>
                            ) : (
                              <span>শেষ পেমেন্ট নেই</span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 ml-auto">
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 gap-1 bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 no-print rounded-lg shadow-sm"
                              onClick={() => openPay(r)}
                            >
                              <Wallet className="h-3 w-3" />
                              পেমেন্ট
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 border-emerald-500/40 bg-emerald-500/10 px-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-500/20 no-print rounded-lg"
                              disabled={!r.phone}
                              onClick={() => handleSendWhatsApp(r)}
                              title="WhatsApp এ পাঠান"
                            >
                              <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden>
                                <path d="M20.52 3.48A11.93 11.93 0 0 0 12.04 0C5.5 0 .17 5.33.17 11.87c0 2.09.55 4.13 1.6 5.93L0 24l6.34-1.66a11.86 11.86 0 0 0 5.7 1.45h.01c6.54 0 11.87-5.33 11.87-11.87 0-3.17-1.24-6.15-3.4-8.44ZM12.05 21.3h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.76.99 1-3.67-.22-.38a9.42 9.42 0 1 1 8.12 4.57Zm5.43-7.05c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.18.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47 0 1.46 1.07 2.86 1.22 3.06.15.2 2.1 3.2 5.08 4.48.71.31 1.27.49 1.7.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z"/>
                              </svg>
                              WA
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 px-2 text-[11px] font-semibold no-print rounded-lg"
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
                  </div>

                  {/* Desktop Table view (visible on md+) */}
                  <div className="hidden md:block overflow-x-auto rounded-xl border border-border/70 bg-card">
                    <table className="w-full border-collapse text-[12px]">
                      <thead>
                        <tr className="bg-muted/70 border-b border-border/70 text-muted-foreground sticky top-0 z-10 backdrop-blur">
                          <th className="px-3 py-2.5 text-center font-bold w-12">#</th>
                          <th className="px-3 py-2.5 text-left font-bold min-w-[170px]">সদস্য</th>
                          <th className="px-3 py-2.5 text-left font-bold min-w-[120px]">মোবাইল</th>
                          <th className="px-3 py-2.5 text-left font-bold min-w-[130px]">শেষ পেমেন্ট</th>
                          <th className="px-3 py-2.5 text-right font-bold min-w-[110px]">
                            {tab === "due" ? "বকেয়া" : "ব্যালেন্স"}
                          </th>
                          <th className="px-3 py-2.5 text-center font-bold min-w-[190px] no-print">অ্যাকশন</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {filteredRows.map((r, i) => (
                          <tr key={r.id} className="transition-colors hover:bg-muted/30">
                            <td className="px-3 py-2.5 text-center text-muted-foreground font-medium">
                              {toBn(String(i + 1))}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <MemberAvatar name={r.name} photoUrl={r.photo_url} size="sm" />
                                <span className="font-semibold text-foreground">{r.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-muted-foreground font-mono text-[11.5px]">
                              {r.phone ? toBn(r.phone) : "—"}
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                              {r.lastAmount && r.lastDate ? (
                                <div>
                                  <span className="font-bold text-foreground">{taka(r.lastAmount)}</span>
                                  <div className="text-[10px] text-muted-foreground">{bnDate(r.lastDate)}</div>
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td
                              className={`px-3 py-2.5 text-right font-black text-sm ${
                                tab === "due" ? "text-primary" : "text-emerald-600"
                              }`}
                            >
                              {tab === "due" ? taka(r.balance) : "৳ ০"}
                            </td>
                            <td className="px-3 py-2.5 text-center no-print">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-7 gap-1 bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90 rounded-lg shadow-sm active:scale-95"
                                  onClick={() => openPay(r)}
                                >
                                  <Wallet className="h-3 w-3" />
                                  পেমেন্ট
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 border-emerald-500/40 bg-emerald-500/10 px-2 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-500/20 rounded-lg active:scale-95"
                                  disabled={!r.phone}
                                  onClick={() => handleSendWhatsApp(r)}
                                  title="WhatsApp এ পাঠান"
                                >
                                  <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden>
                                    <path d="M20.52 3.48A11.93 11.93 0 0 0 12.04 0C5.5 0 .17 5.33.17 11.87c0 2.09.55 4.13 1.6 5.93L0 24l6.34-1.66a11.86 11.86 0 0 0 5.7 1.45h.01c6.54 0 11.87-5.33 11.87-11.87 0-3.17-1.24-6.15-3.4-8.44ZM12.05 21.3h-.01a9.4 9.4 0 0 1-4.79-1.31l-.34-.2-3.76.99 1-3.67-.22-.38a9.42 9.42 0 1 1 8.12 4.57Zm5.43-7.05c-.3-.15-1.76-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.18.2-.35.22-.65.07-.3-.15-1.25-.46-2.39-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51l-.57-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.01-1.04 2.47 0 1.46 1.07 2.86 1.22 3.06.15.2 2.1 3.2 5.08 4.48.71.31 1.27.49 1.7.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z"/>
                                  </svg>
                                  WA
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-7 gap-1 px-2 text-[11px] font-semibold rounded-lg active:scale-95"
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
                          <tr className="bg-primary/10 border-t-2 border-primary/20">
                            <td className="px-3 py-2.5 font-bold text-center" colSpan={4}>
                              মোট বকেয়া ({toBn(filteredRows.length)} জন)
                            </td>
                            <td className="px-3 py-2.5 text-right text-base font-black text-primary">
                              {taka(filteredTotal)}
                            </td>
                            <td className="no-print" />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </>
              )}

            </div>
          </div>

          <DialogFooter className="no-print shrink-0 border-t border-border/60 bg-muted/20 px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
            <div className="text-xs font-semibold text-muted-foreground hidden sm:block">
              {tab === "due"
                ? `মোট বকেয়া: ${taka(filteredTotal)} (${toBn(filteredRows.length)} জন)`
                : `মোট পেইড সদস্য: ${toBn(filteredRows.length)} জন`}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="outline" size="sm" className="h-8 px-4 text-xs font-medium rounded-xl" onClick={() => setOpen(false)}>
                বন্ধ
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 px-4 text-xs font-semibold rounded-xl shadow-sm"
                onClick={() => window.print()}
                disabled={filteredRows.length === 0}
              >
                <Download className="h-3.5 w-3.5" /> PDF ডাউনলোড
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payTarget} onOpenChange={(o) => { if (!o) setPayTarget(null); }}>
        <DialogContent
          className="max-w-sm max-h-[90dvh] overflow-y-auto p-0 rounded-2xl"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
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

function MemberHisabLink({
  memberId,
  onBeforeNavigate,
}: {
  memberId: string;
  onBeforeNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await mintMemberSessionForAdmin({ data: { memberId } });
      if (res?.session) {
        localStorage.setItem(`km-member-session:${memberId}`, res.session);
      }
    } catch (err) {
      console.warn("Could not pre-mint admin session:", err);
    } finally {
      setLoading(false);
      onBeforeNavigate?.();
      navigate({
        to: "/p/$memberId",
        params: { memberId },
        search: { t: "" },
      });
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="text-[10px] font-semibold text-rose-500 hover:underline cursor-pointer disabled:opacity-50"
    >
      {loading ? "লোড হচ্ছে…" : "হিসাব দেখুন →"}
    </button>
  );
}

function DueBreakdownDialog({
  which = "all",
  title = "বকেয়া তালিকা",
  rows,
  total,
  loading,
  trigger,
}: {
  which?: "prev" | "curr" | "all";
  title?: string;
  rows: BreakdownRow[];
  total: number;
  loading?: boolean;
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = rows
    .map((r) => ({
      ...r,
      amount: which === "prev" ? r.prev : which === "curr" ? r.curr : r.total,
    }))
    .filter((r) => r.amount > 0 && r.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.amount - a.amount);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl bg-white/15 px-3 py-2 text-left backdrop-blur-sm transition hover:bg-white/25"
        >
          <div className="text-[10px] text-primary-foreground/80">{title}</div>
          <div className="text-sm font-bold text-primary-foreground">{loading ? "…" : taka(total)}</div>
        </button>
      )}
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl">
        <DialogHeader className="border-b border-border/60 bg-muted/20 px-5 py-4">
          <DialogTitle className="flex items-center justify-between text-base font-bold">
            <span className="flex items-center gap-2">
              <Users className="h-5 w-5 text-rose-600" />
              {title}
            </span>
            <span className="rounded-full bg-rose-50 px-3 py-0.5 text-sm font-bold text-rose-600 border border-rose-200">
              {loading ? "…" : taka(total)}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="border-b border-border/40 px-4 py-2.5 bg-muted/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="সদস্যের নাম দিয়ে খুঁজুন..."
              className="h-8 pl-8 text-xs rounded-xl bg-background"
            />
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-1.5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {search ? "কোনো সদস্য পাওয়া যায়নি" : "কোনো বকেয়া নেই"}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((r, i) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2.5 shadow-2xs hover:border-rose-300 hover:bg-rose-50/30 transition"
                >
                  <span className="w-5 shrink-0 text-center text-[10px] font-bold text-muted-foreground">
                    {toBn(i + 1)}.
                  </span>
                  <MemberAvatar name={r.name} photoUrl={r.photo_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-slate-800">{r.name}</div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <span>পূর্বের: {taka(r.prev)}</span>
                      <span>•</span>
                      <span>এই মাসের: {taka(r.curr)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-rose-600">{taka(r.amount)}</div>
                    <MemberHisabLink memberId={r.id} onBeforeNavigate={() => setOpen(false)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-5 py-3">
          <div className="text-xs text-muted-foreground">
            মোট বকেয়া সদস্য: <span className="font-bold text-foreground">{toBn(filtered.length)} জন</span>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setOpen(false)}>
            বন্ধ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const BN_DAYS = [
  "রবিবার",
  "সোমবার",
  "মঙ্গলবার",
  "বুধবার",
  "বৃহস্পতিবার",
  "শুক্রবার",
  "শনিবার",
];

const BN_MONTHS_NAMES = [
  "জানুয়ারি",
  "ফেব্রুয়ারি",
  "মার্চ",
  "এপ্রিল",
  "মে",
  "জুন",
  "জুলাই",
  "আগস্ট",
  "সেপ্টেম্বর",
  "অক্টোবর",
  "নভেম্বর",
  "ডিসেম্বর",
];

function KuakataBeachBanner() {
  const [time, setTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const dayName = BN_DAYS[time.getDay()];
  const dateNum = toBn(String(time.getDate()).padStart(2, "0"));
  const monthName = BN_MONTHS_NAMES[time.getMonth()];
  const yearNum = toBn(String(time.getFullYear()));
  const formattedDate = `${dateNum} ${monthName}, ${yearNum}`;

  let hours = time.getHours();
  const minutes = toBn(String(time.getMinutes()).padStart(2, "0"));
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  const hoursBn = toBn(String(hours).padStart(2, "0"));
  const formattedTime = `${hoursBn}:${minutes} ${ampm}`;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-sky-200/80 bg-slate-900 p-5 sm:p-7 shadow-sm">
      {/* Real Kuakata Beach Cover Photo */}
      <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
        <img
          src="/kuakata-cover.jpg"
          alt="Kuakata Sea Beach"
          className="h-full w-full object-cover object-[center_55%]"
        />
        {/* Soft elegant gradient overlays for readability and vibrancy */}
        <div className="absolute inset-0 bg-gradient-to-r from-white/92 via-white/75 to-white/10 sm:to-transparent" />
        <div className="absolute inset-0 bg-sky-950/10 mix-blend-multiply" />
      </div>

      {/* Content Row */}
      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        {/* Left: 3D Clapperboard & Greeting */}
        <div className="flex items-center gap-4">
          {/* 3D Clapperboard Icon */}
          <div className="relative grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-red-500 via-rose-600 to-red-700 p-2 text-white shadow-lg shadow-red-500/30">
            {/* Diagonal striped clapper top */}
            <div className="flex h-3 w-full items-center overflow-hidden rounded-xs bg-slate-900 border border-white/40 mb-0.5">
              <div className="h-full w-2 bg-white -skew-x-12" />
              <div className="h-full w-2 bg-slate-900 -skew-x-12" />
              <div className="h-full w-2 bg-white -skew-x-12" />
              <div className="h-full w-2 bg-slate-900 -skew-x-12" />
              <div className="h-full w-2 bg-white -skew-x-12" />
              <div className="h-full w-2 bg-slate-900 -skew-x-12" />
            </div>
            <Clapperboard className="h-6 w-6 text-white" />
          </div>

          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 tracking-tight drop-shadow-xs">
              স্বাগতম, কবির হোসেন শুভ!
            </h1>
            <p className="mt-1 text-xs sm:text-sm font-semibold text-slate-700 drop-shadow-xs">
              Kuakata Multimedia এর টিম ম্যানেজমেন্ট ড্যাশবোর্ডে আপনাকে স্বাগতম।
            </p>
          </div>
        </div>

        {/* Right: Floating Glossy Colorful Glass Cards */}
        <div className="flex items-center gap-3 self-start lg:self-auto flex-wrap sm:flex-nowrap">
          {/* 1. Date Card (Glossy Colorful Translucent Glass) */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-white/45 via-rose-500/10 to-amber-500/10 px-4 py-3 shadow-[0_8px_24px_rgba(244,63,94,0.12)] backdrop-blur-xl transition hover:shadow-xl hover:scale-[1.02]">
            {/* Top specular highlight line for glossy finish */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white to-transparent opacity-90" />

            <div className="relative z-10 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-rose-500 via-red-500 to-amber-500 text-white shadow-md shadow-rose-500/30 ring-2 ring-white/80 group-hover:rotate-6 transition-transform">
                <Calendar className="h-5 w-5 drop-shadow-xs" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-rose-950/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                  আজকের তারিখ
                </div>
                <div className="text-xs sm:text-sm font-black text-slate-900 tracking-tight drop-shadow-2xs">
                  {formattedDate}
                </div>
                <div className="text-[10px] font-bold text-rose-700 bg-rose-500/15 rounded-full px-2 py-0.5 inline-block mt-0.5 border border-rose-300/50">
                  {dayName}
                </div>
              </div>
            </div>
          </div>

          {/* 2. Time Card (Glossy Colorful Translucent Glass) */}
          <div className="group relative overflow-hidden rounded-2xl border border-white/70 bg-gradient-to-br from-white/45 via-sky-500/10 to-indigo-500/10 px-4 py-3 shadow-[0_8px_24px_rgba(14,165,233,0.12)] backdrop-blur-xl transition hover:shadow-xl hover:scale-[1.02]">
            {/* Top specular highlight line for glossy finish */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-white to-transparent opacity-90" />

            <div className="relative z-10 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-600 text-white shadow-md shadow-sky-500/30 ring-2 ring-white/80 group-hover:rotate-6 transition-transform">
                <Clock className="h-5 w-5 drop-shadow-xs" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-sky-950/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  বর্তমান সময়
                </div>
                <div className="text-base sm:text-lg font-black font-mono tracking-tight text-slate-900 drop-shadow-2xs">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-rose-600 to-red-500 font-extrabold">
                    {hoursBn}:{minutes}
                  </span>{" "}
                  <span className="text-[11px] font-bold text-indigo-700 bg-indigo-500/15 rounded-md px-1.5 py-0.5 border border-indigo-300/50 align-middle">
                    {ampm}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CircularProgress({ percent }: { percent: number }) {
  const r = 24;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="h-14 w-14 -rotate-90 transform">
        <circle
          cx="28"
          cy="28"
          r={r}
          stroke="currentColor"
          strokeWidth="4.5"
          className="text-sky-100 dark:text-sky-950"
          fill="transparent"
        />
        <circle
          cx="28"
          cy="28"
          r={r}
          stroke="currentColor"
          strokeWidth="4.5"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-sky-500 transition-all duration-1000 ease-out"
          fill="transparent"
        />
      </svg>
      <span className="absolute text-[11px] font-black text-sky-700 dark:text-sky-300">
        {toBn(String(percent))}%
      </span>
    </div>
  );
}

function TopStatsRow({
  totalDue,
  dueMembersCount,
  clientDue,
  clientDueChannelsCount,
  paidThisMonth,
  totalMembers,
  activeMembers,
}: {
  totalDue: number;
  dueMembersCount: number;
  clientDue: number;
  clientDueChannelsCount: number;
  paidThisMonth: number;
  totalMembers: number;
  activeMembers: number;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. মোট বকেয়া */}
      <Link
        to="/members"
        className="group relative overflow-hidden rounded-3xl border border-rose-200/70 bg-gradient-to-br from-rose-50/90 via-white to-red-50/40 p-5 shadow-xs transition hover:shadow-md hover:-translate-y-0.5"
      >
        <div className="flex items-center justify-between">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-600 text-white shadow-md shadow-rose-600/25 group-hover:scale-105 transition-transform">
            <AlertCircle className="h-6 w-6" />
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
            বকেয়া
          </span>
        </div>
        <div className="mt-3">
          <div className="text-xs font-semibold text-rose-800">মোট বকেয়া</div>
          <div className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight">
            {taka(totalDue)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">
            {toBn(String(dueMembersCount))} জন সদস্যের বকেয়া
          </div>
        </div>
      </Link>

      {/* 2. ক্লায়েন্ট বকেয়া */}
      <Link
        to="/client-dues"
        className="group relative overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 via-white to-green-50/40 p-5 shadow-xs transition hover:shadow-md hover:-translate-y-0.5"
      >
        <div className="flex items-center justify-between">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-white shadow-md shadow-emerald-600/25 group-hover:scale-105 transition-transform">
            <Handshake className="h-6 w-6" />
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
            ক্লায়েন্ট
          </span>
        </div>
        <div className="mt-3">
          <div className="text-xs font-semibold text-emerald-800">ক্লায়েন্ট বকেয়া</div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-700 tracking-tight">
            {taka(clientDue)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">
            {toBn(String(clientDueChannelsCount))} টি চ্যানেলের বকেয়া
          </div>
        </div>
      </Link>

      {/* 3. মোট পেমেন্ট */}
      <Link
        to="/payments"
        className="group relative overflow-hidden rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/40 p-5 shadow-xs transition hover:shadow-md hover:-translate-y-0.5"
      >
        <div className="flex items-center justify-between">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/25 group-hover:scale-105 transition-transform">
            <Wallet className="h-6 w-6" />
          </div>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            ↑ +৫%
          </span>
        </div>
        <div className="mt-3">
          <div className="text-xs font-semibold text-amber-800">মোট পেমেন্ট</div>
          <div className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">
            {taka(paidThisMonth)}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">
            এই মাসে পরিশোধ
          </div>
        </div>
      </Link>

      {/* 4. মোট সদস্য */}
      <Link
        to="/members"
        className="group relative overflow-hidden rounded-3xl border border-sky-200/70 bg-gradient-to-br from-sky-50/90 via-white to-blue-50/40 p-5 shadow-xs transition hover:shadow-md hover:-translate-y-0.5"
      >
        <div className="flex items-center justify-between">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-600 text-white shadow-md shadow-sky-600/25 group-hover:scale-105 transition-transform">
            <Users className="h-6 w-6" />
          </div>
          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
            ↑ +২
          </span>
        </div>
        <div className="mt-3">
          <div className="text-xs font-semibold text-sky-800">মোট সদস্য</div>
          <div className="text-3xl font-black text-slate-800 tracking-tight">
            {toBn(String(totalMembers))}
          </div>
          <div className="mt-1 text-[11px] text-slate-500 font-medium">
            সক্রিয়: {toBn(String(activeMembers))} জন
          </div>
        </div>
      </Link>
    </div>
  );
}

function MonthlySummaryChart() {
  const now = new Date();
  const monthName = now.toLocaleDateString("bn-BD", { month: "long", year: "numeric" });
  const monthStart = useMemo(
    () => new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
    [],
  );
  const monthEnd = useMemo(
    () => new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
    [],
  );

  // 1. Fetch running month's shootings
  const { data: shootings = [], isLoading: isShootingsLoading } = useQuery({
    queryKey: ["month-shootings-chart", monthStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date")
        .gte("shoot_date", monthStart)
        .lte("shoot_date", monthEnd)
        .order("shoot_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; shoot_date: string }[];
    },
    staleTime: 1000 * 60 * 2,
  });

  const ids = useMemo(() => shootings.map((s) => s.id), [shootings]);

  // 2. Fetch costs for each shooting via shooting_summary RPC
  const summariesQuery = useQuery({
    queryKey: ["month-shooting-summaries-chart", ids.join(",")],
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
    staleTime: 1000 * 60 * 2,
  });

  const summaries = summariesQuery.data ?? {};
  const isLoading = isShootingsLoading || summariesQuery.isLoading;

  // 3. Format chart items
  const chartData = useMemo(() => {
    return shootings.map((s) => {
      const sum = summaries[s.id] ?? { total: 0, att: 0, extra: 0, present: 0 };
      const shootDay = toBn(s.shoot_date.slice(8, 10));
      return {
        id: s.id,
        name: s.name,
        displayName: s.name.length > 10 ? s.name.slice(0, 9) + "…" : s.name,
        date: s.shoot_date,
        dayLabel: `${shootDay} নভে`,
        total: sum.total,
        att: sum.att,
        extra: sum.extra,
        present: sum.present,
      };
    });
  }, [shootings, summaries]);

  const totalMonthExpense = useMemo(
    () => chartData.reduce((acc, c) => acc + c.total, 0),
    [chartData],
  );

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs flex flex-col h-full">
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-red-600 text-white shadow-xs">
            <Clapperboard className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-800">চলতি মাসের শুটিং ও খরচ</h2>
            <div className="text-[11px] text-slate-500 font-medium">
              মোট {toBn(String(shootings.length))} টি শুটিং • মোট খরচ:{" "}
              <span className="font-bold text-red-600">৳ {taka(totalMonthExpense)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-full bg-red-600 text-white px-3 py-1 text-xs font-semibold shadow-xs">
          {monthName} ▾
        </div>
      </div>

      {/* Legend & Stats Pills */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3 font-medium">
          <span className="flex items-center gap-1.5 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500"></span>
            মোট খরচ
          </span>
          <span className="flex items-center gap-1.5 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            হাজিরা
          </span>
          <span className="flex items-center gap-1.5 text-slate-700">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span>
            অন্যান্য
          </span>
        </div>

        {chartData.length > 0 && (
          <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 rounded-full px-2.5 py-0.5">
            গড়: ৳ {taka(Math.round(totalMonthExpense / (chartData.length || 1)))}/শুটিং
          </span>
        )}
      </div>

      {/* Chart Canvas */}
      <div className="h-56 w-full flex-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin text-red-600" />
              শুটিং ডেটা লোড হচ্ছে…
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center p-4 rounded-2xl bg-slate-50/60 border border-dashed border-slate-200">
            <Clapperboard className="h-8 w-8 text-slate-300 mb-1" />
            <div className="text-xs font-bold text-slate-700">চলতি মাসে কোনো শুটিং রেকর্ড নেই</div>
            <p className="text-[11px] text-slate-400 mt-0.5">নতুন শুটিং যুক্ত করলে খরচ গ্রাফে শো হবে</p>
            <Link
              to="/shootings"
              className="mt-3 inline-flex items-center gap-1 rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition"
            >
              <Plus className="h-3.5 w-3.5" /> শুটিং তৈরি করুন
            </Link>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 12, right: 10, left: -10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="barRedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#dc2626" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="barEmeraldGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#059669" stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="barAmberGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#d97706" stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="displayName"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                stroke="#94a3b8"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => "৳" + toBn(String(Math.round(v / 1000))) + "k"}
              />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="rounded-2xl border border-slate-700/80 bg-slate-900/95 p-3 text-white shadow-xl backdrop-blur-md min-w-[190px]">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-red-400 mb-1">
                          <Clapperboard className="h-3.5 w-3.5" />
                          <span className="truncate">{d.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mb-2 font-medium">
                          তারিখ: {bnDate(d.date)}
                        </div>
                        <div className="space-y-1 text-xs border-t border-slate-800 pt-2">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-300">মোট খরচ:</span>
                            <span className="font-extrabold text-amber-400">৳ {taka(d.total)}</span>
                          </div>
                          <div className="flex justify-between items-center text-[11px] text-slate-400">
                            <span>হাজিরা খরচ ({toBn(String(d.present))} জন):</span>
                            <span>৳ {taka(d.att)}</span>
                          </div>
                          {d.extra > 0 && (
                            <div className="flex justify-between items-center text-[11px] text-slate-400">
                              <span>অন্যান্য খরচ:</span>
                              <span>৳ {taka(d.extra)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Bar dataKey="total" radius={[8, 8, 0, 0]} maxBarSize={48}>
                {chartData.map((_, index) => {
                  const colors = ["url(#barRedGradient)", "url(#barEmeraldGradient)", "url(#barAmberGradient)"];
                  return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Running Month Shootings Chips List */}
      {chartData.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-2 items-center">
          {chartData.map((s, idx) => (
            <Link
              key={s.id}
              to="/shootings"
              className="group flex items-center gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 hover:bg-red-50 hover:border-red-200 px-3 py-1.5 text-xs transition active:scale-95"
            >
              <div className="grid h-5 w-5 place-items-center rounded-md bg-red-100 text-red-600 font-bold text-[10px] group-hover:bg-red-500 group-hover:text-white transition">
                {toBn(String(idx + 1))}
              </div>
              <span className="font-semibold text-slate-800 group-hover:text-red-700 max-w-[120px] truncate">
                {s.name}
              </span>
              <span className="font-bold text-red-600 bg-white px-2 py-0.5 rounded-lg border border-slate-200/60 shadow-2xs">
                ৳ {taka(s.total)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function RecentActivityFeed({
  recentPayments,
  recentShootings,
}: {
  recentPayments: PaymentRow[];
  recentShootings: ShootingRow[];
}) {
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs flex flex-col h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <CalendarDays className="h-4 w-4 text-red-600" /> সাম্প্রতিক কার্যক্রম
        </h2>
        <Link
          to="/payments"
          className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-xs hover:bg-red-700 transition"
        >
          সব দেখুন <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="space-y-3 flex-1 overflow-y-auto">
        {/* Attendance activity */}
        <div className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/60 p-2.5 transition hover:bg-muted/40">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-slate-800">টিম হাজিরা সম্পন্ন</div>
            <div className="text-[10px] text-slate-500">আজকের হাজিরা আপডেট হয়েছে</div>
          </div>
          <span className="text-[10px] font-semibold text-slate-500 shrink-0">আজ</span>
        </div>

        {/* Payments activities */}
        {recentPayments.slice(0, 2).map((p, idx) => (
          <div key={p.id || idx} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/60 p-2.5 transition hover:bg-muted/40">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600">
              <BadgeDollarSign className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-slate-800">
                {p.member?.name || "সদস্য"} পেমেন্ট: ৳ {taka(p.amount)}
              </div>
              <div className="text-[10px] text-slate-500">{bnDate(p.paid_at)}</div>
            </div>
            <span className="text-[10px] font-semibold text-rose-600 shrink-0 font-mono">
              ৳ {taka(p.amount)}
            </span>
          </div>
        ))}

        {/* Shootings activities */}
        {recentShootings.slice(0, 2).map((s, idx) => (
          <div key={s.id || idx} className="flex items-center gap-3 rounded-2xl border border-border/50 bg-background/60 p-2.5 transition hover:bg-muted/40">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-600">
              <Clapperboard className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-slate-800">
                নতুন শুটিং: {s.name}
              </div>
              <div className="text-[10px] text-slate-500">{bnDate(s.shoot_date)}</div>
            </div>
            <span className="text-[10px] font-semibold text-sky-600 shrink-0">
              {bnDate(s.shoot_date)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickActionsCard() {
  return (
    <section className="rounded-3xl border border-border/70 bg-card p-5 shadow-xs">
      <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100 mb-4">
        <Zap className="h-4 w-4 text-amber-500 fill-amber-500" /> দ্রুত অ্যাকশন
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Shooting */}
        <Link
          to="/shootings"
          className="flex flex-col items-center gap-2 rounded-2xl border border-rose-200/60 bg-rose-50/50 p-3 sm:p-3.5 text-center transition hover:bg-rose-100/70 hover:border-rose-300 hover:shadow-xs active:scale-95 cursor-pointer"
        >
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-500 text-white shadow-xs">
            <Camera className="h-6 w-6" />
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">শুটিং তৈরি</span>
        </Link>

        {/* Member */}
        <Link
          to="/members"
          className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-200/60 bg-emerald-50/50 p-3 sm:p-3.5 text-center transition hover:bg-emerald-100/70 hover:border-emerald-300 hover:shadow-xs active:scale-95 cursor-pointer"
        >
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500 text-white shadow-xs">
            <UserPlus className="h-6 w-6" />
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">সদস্য যুক্ত</span>
        </Link>

        {/* Report */}
        <Link
          to="/reports"
          className="flex flex-col items-center gap-2 rounded-2xl border border-blue-200/60 bg-blue-50/50 p-3 sm:p-3.5 text-center transition hover:bg-blue-100/70 hover:border-blue-300 hover:shadow-xs active:scale-95 cursor-pointer"
        >
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500 text-white shadow-xs">
            <FileText className="h-6 w-6" />
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">রিপোর্ট</span>
        </Link>

        {/* Attendance */}
        <Link
          to="/attendance"
          className="flex flex-col items-center gap-2 rounded-2xl border border-purple-200/60 bg-purple-50/50 p-3 sm:p-3.5 text-center transition hover:bg-purple-100/70 hover:border-purple-300 hover:shadow-xs active:scale-95 cursor-pointer"
        >
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-purple-500 text-white shadow-xs">
            <CalendarDays className="h-6 w-6" />
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">উপস্থিতি</span>
        </Link>
      </div>
    </section>
  );
}

function BottomTwoCards({ upcomingShootingName }: { upcomingShootingName?: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {/* 1. গুরুত্বপূর্ণ বার্তা */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 via-green-50/50 to-teal-50/40 p-5 shadow-xs flex flex-col justify-between">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 mb-2">
            <Megaphone className="h-4 w-4 text-emerald-600" />
            গুরুত্বপূর্ণ বার্তা
          </div>
          <p className="text-xs sm:text-sm font-semibold text-slate-800 leading-snug">
            {upcomingShootingName
              ? `আসন্ন নতুন শুটিং: "${upcomingShootingName}" এর শিডিউল চূড়ান্ত করা হয়েছে।`
              : "আগামী ১৬ নভেম্বর নতুন নাটকের শুটিং শুরু হবে।"}
          </p>
        </div>

        <div className="relative z-10 mt-3 flex items-center justify-between">
          <Link
            to="/shootings"
            className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-red-700 transition active:scale-95 cursor-pointer"
          >
            বিস্তারিত দেখুন <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
          <Clapperboard className="h-10 w-10 text-emerald-800/20" />
        </div>
      </section>

      {/* 2. টিমের অনুপ্রেরণা */}
      <section className="rounded-3xl border border-amber-200/70 bg-gradient-to-br from-amber-50/90 via-yellow-50/40 to-orange-50/30 p-5 shadow-xs flex flex-col justify-between text-center">
        <div className="flex items-center justify-center gap-2 text-xs font-bold text-amber-800 mb-1">
          <Trophy className="h-4 w-4 text-amber-600" />
          টিমের অনুপ্রেরণা
        </div>

        <div className="my-auto py-2">
          <p className="text-sm sm:text-base font-black italic text-slate-800 leading-snug tracking-tight">
            “একসাথে কাজ করি, আরো ভালো কিছু তৈরি করি।”
          </p>
          <div className="mt-1 text-[10px] font-semibold text-slate-500">
            — Kuakata Multimedia Team
          </div>
        </div>

        <div className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">
          Unity · Creativity · Excellence
        </div>
      </section>
    </div>
  );
}

