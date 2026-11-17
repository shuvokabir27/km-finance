import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { taka, toBn, bnDate } from "@/lib/format";
import { BrandAvatar, useChannels } from "@/lib/brand";
import {
  useSharedSummary,
  useLedger,
  SOURCE_LABEL,
  METHOD_LABEL,
  type ChannelSummary,
  type LedgerRow,
} from "@/routes/_authenticated/shared-channels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Handshake,
  TrendingUp,
  Receipt,
  Wallet,
  CircleAlert,
  Plus,
  BadgeDollarSign,
  ArrowUpRight,
  ChevronRight,
  Calendar,
  Clock,
  Sparkles,
  Users,
  Building2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

export function DashboardSharedChannelsSection() {
  const { data: summary = [], isLoading } = useSharedSummary();
  const { data: ledger = [] } = useLedger();
  const { data: channels = [] } = useChannels();

  // Dialog states for direct action from any button
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payDefaultChannel, setPayDefaultChannel] = useState<string | undefined>();
  const [payDefaultPartner, setPayDefaultPartner] = useState<string | undefined>();
  const [payDefaultMember, setPayDefaultMember] = useState<string | undefined>();
  const [payDefaultMode, setPayDefaultMode] = useState<"partner" | "member">("partner");

  const [incomeDialogOpen, setIncomeDialogOpen] = useState(false);
  const [incomeDefaultChannel, setIncomeDefaultChannel] = useState<string | undefined>();

  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [expenseDefaultChannel, setExpenseDefaultChannel] = useState<string | undefined>();

  // Aggregate totals
  const totals = useMemo(() => {
    return summary.reduce(
      (acc, s) => ({
        income: acc.income + Number(s.income_total || 0),
        expense: acc.expense + Number(s.expense_total || 0),
        net: acc.net + Number(s.net_profit || 0),
      }),
      { income: 0, expense: 0, net: 0 }
    );
  }, [summary]);

  const totalDue = useMemo(() => {
    return ledger.reduce((acc, r) => acc + Math.max(Number(r.due || 0), 0), 0);
  }, [ledger]);

  const duePartnersCount = useMemo(() => {
    return ledger.filter((r) => Number(r.due || 0) > 0).length;
  }, [ledger]);

  // Recent Incomes Query
  const { data: recentIncomes = [] } = useQuery({
    queryKey: ["dashboard-recent-channel-incomes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_incomes")
        .select("id, amount, source, earned_at, note, channel_id, channels(name)")
        .order("earned_at", { ascending: false })
        .limit(4);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        amount: number;
        source: string;
        earned_at: string;
        note: string | null;
        channel_id: string;
        channels: { name: string } | null;
      }>;
    },
    staleTime: 1000 * 60 * 2,
  });

  // Recent Payouts Query
  const { data: recentPayouts = [] } = useQuery({
    queryKey: ["dashboard-recent-partner-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_payouts")
        .select("id, amount, method, paid_at, note, partner_id, channel_partners(partner_name, channel_id, channels(name))")
        .order("paid_at", { ascending: false })
        .limit(4);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        amount: number;
        method: string;
        paid_at: string;
        note: string | null;
        partner_id: string;
        channel_partners: {
          partner_name: string;
          channel_id: string;
          channels: { name: string } | null;
        } | null;
      }>;
    },
    staleTime: 1000 * 60 * 2,
  });

  const [activeTab, setActiveTab] = useState<"channels" | "activity">("channels");

  const openPayForPartner = (channelId?: string, partnerId?: string) => {
    setPayDefaultChannel(channelId);
    setPayDefaultPartner(partnerId);
    setPayDefaultMember(undefined);
    setPayDefaultMode("partner");
    setPayDialogOpen(true);
  };

  const openPayForMember = (channelId?: string, memberId?: string) => {
    setPayDefaultChannel(channelId);
    setPayDefaultPartner(undefined);
    setPayDefaultMember(memberId);
    setPayDefaultMode("member");
    setPayDialogOpen(true);
  };

  const openIncomeForChannel = (channelId: string) => {
    setIncomeDefaultChannel(channelId);
    setIncomeDialogOpen(true);
  };

  const openExpenseForChannel = (channelId: string) => {
    setExpenseDefaultChannel(channelId);
    setExpenseDialogOpen(true);
  };

  return (
    <section className="space-y-4 rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white via-slate-50/40 to-slate-100/30 p-4 sm:p-6 shadow-xs">
      {/* 1. Header with Title & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white shadow-md shadow-indigo-600/25">
            <Handshake className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-800">
                শেয়ার চ্যানেল হিসাব ও ব্যবস্থাপনা
              </h2>
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10.5px] font-bold text-purple-700">
                {toBn(summary.length)}টি চ্যানেল
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              অংশীদারি চ্যানেলের মোট আয়, খরচ, নিট লাভ ও পার্টনারদের ভাগ পরিশোধ
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => openPayForPartner()}
            className="h-8 sm:h-9 gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-xs shadow-xs shadow-emerald-600/20"
          >
            <BadgeDollarSign className="h-3.5 w-3.5" />
            <span>ভাগ পরিশোধ</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => openPayForMember()}
            className="h-8 sm:h-9 gap-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white font-bold text-xs shadow-xs shadow-teal-600/20"
          >
            <Users className="h-3.5 w-3.5" />
            <span>হাজিরা পেমেন্ট</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={() => {
              setIncomeDefaultChannel(undefined);
              setIncomeDialogOpen(true);
            }}
            className="h-8 sm:h-9 gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs shadow-xs shadow-blue-600/20"
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span>আয় যোগ</span>
          </Button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setExpenseDefaultChannel(undefined);
              setExpenseDialogOpen(true);
            }}
            className="h-8 sm:h-9 gap-1.5 rounded-xl border-rose-200 bg-rose-50/50 hover:bg-rose-100 text-rose-700 font-bold text-xs"
          >
            <Receipt className="h-3.5 w-3.5 text-rose-600" />
            <span>ব্যয় যোগ</span>
          </Button>

          <Link
            to="/shared-channels"
            className="inline-flex h-8 sm:h-9 items-center gap-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3 text-xs font-semibold text-slate-700 shadow-2xs transition hover:text-primary"
          >
            <span>সব দেখুন</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* 2. Top 4 Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
        {/* মোট আয় */}
        <div className="rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50/90 via-white to-green-50/30 p-3 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-emerald-800">মোট ইনকাম</span>
            <div className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-xl bg-emerald-600 text-white shadow-xs">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base sm:text-xl font-black text-emerald-700">
              {isLoading ? "…" : taka(totals.income)}
            </div>
            <div className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
              সকল শেয়ার চ্যানেলের মোট আয়
            </div>
          </div>
        </div>

        {/* মোট ব্যয় */}
        <div className="rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50/90 via-white to-red-50/30 p-3 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-rose-800">মোট খরচ</span>
            <div className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-xl bg-rose-600 text-white shadow-xs">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base sm:text-xl font-black text-rose-600">
              {isLoading ? "…" : taka(totals.expense)}
            </div>
            <div className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
              হাজিরা ও শুটিংয়ের সকল খরচ
            </div>
          </div>
        </div>

        {/* নিট লাভ */}
        <div className="rounded-2xl border border-blue-200/70 bg-gradient-to-br from-blue-50/90 via-white to-indigo-50/30 p-3 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-blue-800">নিট লাভ</span>
            <div className={`grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-xl ${totals.net >= 0 ? "bg-blue-600" : "bg-rose-600"} text-white shadow-xs`}>
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className={`text-base sm:text-xl font-black ${totals.net >= 0 ? "text-blue-700" : "text-rose-600"}`}>
              {isLoading ? "…" : taka(totals.net)}
            </div>
            <div className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
              {totals.net >= 0 ? "মোট নিট মুনাফা" : "মোট ক্ষতি"}
            </div>
          </div>
        </div>

        {/* পার্টনারদের ভাগ বকেয়া */}
        <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/30 p-3 sm:p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] sm:text-xs font-semibold text-amber-800">মালিকদের ভাগ বকেয়া</span>
            <div className="grid h-7 w-7 sm:h-8 sm:w-8 place-items-center rounded-xl bg-amber-500 text-white shadow-xs">
              <CircleAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-base sm:text-xl font-black text-amber-700">
              {isLoading ? "…" : taka(totalDue)}
            </div>
            <div className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
              {duePartnersCount > 0 ? `${toBn(duePartnersCount)} জন মালিকের পাওনা রয়েছে` : "সব পরিশোধিত"}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Section View Tabs: চ্যানেলের বিস্তারিত তালিকা vs সাম্প্রতিক লেনদেন */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("channels")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === "channels"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            শেয়ার চ্যানেল তালিকা ({toBn(summary.length)})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("activity")}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === "activity"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            সাম্প্রতিক আয় ও পরিশোধ
          </button>
        </div>

        <Link
          to="/shared-channels"
          className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
        >
          <span>পূর্ণাঙ্গ পেজে যান</span>
          <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Tab 1: Channels Grid */}
      {activeTab === "channels" && (
        <>
          {isLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">
              শেয়ার চ্যানেলের হিসাব লোড হচ্ছে…
            </div>
          )}

          {!isLoading && summary.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Handshake className="mx-auto mb-2 h-9 w-9 text-slate-400" />
              <div className="text-sm font-semibold text-slate-800">এখনও কোনো শেয়ার চ্যানেল যুক্ত করা হয়নি</div>
              <p className="mt-1 text-xs text-muted-foreground">
                শেয়ার চ্যানেল পেজ থেকে নতুন বা বিদ্যমান চ্যানেলকে শেয়ার চ্যানেল হিসেবে যুক্ত করুন।
              </p>
              <Link
                to="/shared-channels"
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> শেয়ার চ্যানেল যোগ করুন
              </Link>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {summary.map((s) => {
              const ch = channels.find((c) => c.id === s.channel_id);
              const channelPartners = ledger.filter((l) => l.channel_id === s.channel_id);
              const channelDue = channelPartners.reduce(
                (a, r) => a + Math.max(Number(r.due || 0), 0),
                0
              );

              return (
                <div
                  key={s.channel_id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-xs transition hover:shadow-md hover:border-slate-300"
                >
                  <div>
                    {/* Channel Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <BrandAvatar
                          kind="channel"
                          name={s.channel_name}
                          src={ch?.logo_url}
                          size={40}
                        />
                        <div className="min-w-0">
                          <h3 className="font-bold text-slate-800 text-sm truncate">
                            {s.channel_name}
                          </h3>
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.2 text-[10px] font-medium text-slate-700">
                              <Users className="h-3 w-3" /> {toBn(s.partner_count)} জন মালিক
                            </span>
                            {channelDue > 0 && (
                              <span className="rounded-full bg-rose-100 px-1.5 py-0.2 text-[10px] font-bold text-rose-700">
                                বকেয়া: {taka(channelDue)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <Link
                        to="/shared-channels"
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                        title="বিস্তারিত দেখুন"
                      >
                        <ArrowUpRight className="h-4 w-4" />
                      </Link>
                    </div>

                    {/* 3 Stats (ইনকাম, খরচ, নিট) */}
                    <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                      <div className="rounded-xl bg-emerald-50/70 p-2 border border-emerald-100/60">
                        <div className="text-[10px] font-medium text-emerald-800">ইনকাম</div>
                        <div className="text-xs font-bold text-emerald-700 truncate">
                          {taka(s.income_total)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-rose-50/70 p-2 border border-rose-100/60">
                        <div className="text-[10px] font-medium text-rose-800">খরচ</div>
                        <div className="text-xs font-bold text-rose-600 truncate">
                          {taka(s.expense_total)}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-100/80 p-2 border border-slate-200/60">
                        <div className="text-[10px] font-medium text-slate-600">নিট লাভ</div>
                        <div
                          className={`text-xs font-bold truncate ${
                            s.net_profit >= 0 ? "text-slate-900" : "text-rose-600"
                          }`}
                        >
                          {taka(s.net_profit)}
                        </div>
                      </div>
                    </div>

                    {/* Partners List & Entitlements */}
                    {channelPartners.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-500">
                          মালিকদের ভাগ ও বকেয়া:
                        </div>
                        <div className="space-y-1">
                          {channelPartners.map((p) => (
                            <div
                              key={p.partner_id}
                              className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1 text-xs"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-semibold text-slate-800 truncate">
                                  {p.partner_name}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  ({toBn(p.share_percent)}%)
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-muted-foreground text-[11px]">
                                  প্রাপ্য: {taka(p.entitled)}
                                </span>
                                {p.due > 0 ? (
                                  <span className="font-bold text-rose-600 text-[11px]">
                                    বকেয়া: {taka(p.due)}
                                  </span>
                                ) : (
                                  <span className="font-medium text-emerald-600 text-[10.5px]">
                                    পরিশোধিত
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Channel Action Buttons */}
                  <div className="mt-3.5 pt-3 border-t border-slate-100 grid grid-cols-2 gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => openPayForPartner(s.channel_id)}
                      className="h-7.5 gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
                    >
                      <BadgeDollarSign className="h-3 w-3" />
                      <span>ভাগ পরিশোধ</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() => openPayForMember(s.channel_id)}
                      className="h-7.5 gap-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[11px] font-bold"
                    >
                      <Users className="h-3 w-3" />
                      <span>হাজিরা পেমেন্ট</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openIncomeForChannel(s.channel_id)}
                      className="h-7 gap-1 rounded-lg border-blue-200 text-blue-700 hover:bg-blue-50 text-[11px] font-bold"
                    >
                      <TrendingUp className="h-3 w-3" />
                      <span>আয় যোগ</span>
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openExpenseForChannel(s.channel_id)}
                      className="h-7 gap-1 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 text-[11px] font-bold"
                    >
                      <Receipt className="h-3 w-3" />
                      <span>ব্যয় যোগ</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Tab 2: Recent Activity (Incomes & Payouts) */}
      {activeTab === "activity" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Recent Incomes */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span>সাম্প্রতিক আয় এন্ট্রি</span>
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIncomeDefaultChannel(undefined);
                  setIncomeDialogOpen(true);
                }}
                className="h-6 text-[11px] text-primary hover:bg-primary/5"
              >
                + আয় যোগ
              </Button>
            </div>

            {recentIncomes.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                এখনও কোনো আয়ের এন্ট্রি নেই
              </div>
            ) : (
              <div className="space-y-2">
                {recentIncomes.map((inc) => (
                  <div
                    key={inc.id}
                    className="flex items-center justify-between rounded-xl bg-slate-50/80 border border-slate-100 p-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">
                        {inc.channels?.name || "শেয়ার চ্যানেল"} ·{" "}
                        <span className="text-emerald-700">
                          {SOURCE_LABEL[inc.source] || inc.source}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {bnDate(inc.earned_at)} {inc.note ? `· ${inc.note}` : ""}
                      </div>
                    </div>
                    <div className="font-bold text-emerald-600 shrink-0 text-sm">
                      +{taka(Number(inc.amount))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Payouts */}
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <BadgeDollarSign className="h-4 w-4 text-purple-600" />
                <span>সাম্প্রতিক ভাগ পরিশোধ</span>
              </h3>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPayDefaultChannel(undefined);
                  setPayDefaultPartner(undefined);
                  setPayDialogOpen(true);
                }}
                className="h-6 text-[11px] text-primary hover:bg-primary/5"
              >
                + পরিশোধ দিন
              </Button>
            </div>

            {recentPayouts.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                এখনও কোনো পরিশোধের এন্ট্রি নেই
              </div>
            ) : (
              <div className="space-y-2">
                {recentPayouts.map((pay) => (
                  <div
                    key={pay.id}
                    className="flex items-center justify-between rounded-xl bg-slate-50/80 border border-slate-100 p-2.5 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 truncate">
                        {pay.channel_partners?.partner_name || "পার্টনার"} ·{" "}
                        <span className="text-purple-700">
                          {pay.channel_partners?.channels?.name || "শেয়ার চ্যানেল"}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {bnDate(pay.paid_at)} · {METHOD_LABEL[pay.method] || pay.method}{" "}
                        {pay.note ? `· ${pay.note}` : ""}
                      </div>
                    </div>
                    <div className="font-bold text-slate-800 shrink-0 text-sm">
                      -{taka(Number(pay.amount))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Quick Modals */}
      <QuickSharedPaymentDialog
        open={payDialogOpen}
        onOpenChange={setPayDialogOpen}
        defaultChannelId={payDefaultChannel}
        defaultPartnerId={payDefaultPartner}
        defaultMemberId={payDefaultMember}
        defaultMode={payDefaultMode}
      />

      <QuickSharedIncomeDialog
        open={incomeDialogOpen}
        onOpenChange={setIncomeDialogOpen}
        defaultChannelId={incomeDefaultChannel}
      />

      <QuickSharedExpenseDialog
        open={expenseDialogOpen}
        onOpenChange={setExpenseDialogOpen}
        defaultChannelId={expenseDefaultChannel}
      />
    </section>
  );
}

/* =========================================================================
 * 1. QuickSharedPaymentDialog: ভাগ পরিশোধ ও সদস্য হাজিরা পেমেন্ট
 * ========================================================================= */
function QuickSharedPaymentDialog({
  open,
  onOpenChange,
  defaultChannelId,
  defaultPartnerId,
  defaultMemberId,
  defaultMode = "partner",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultChannelId?: string;
  defaultPartnerId?: string;
  defaultMemberId?: string;
  defaultMode?: "partner" | "member";
}) {
  const qc = useQueryClient();
  const { data: summary = [] } = useSharedSummary();
  const { data: ledger = [] } = useLedger();

  const [channelId, setChannelId] = useState<string>("");
  const [payType, setPayType] = useState<"partner" | "member">(defaultMode);
  const [target, setTarget] = useState<string>(""); // "p:<id>" or "m:<id>"
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("cash");
  const [account, setAccount] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState<string>("");

  const currentChannel = summary.find((s) => s.channel_id === channelId);

  // Fetch attendance members for this channel
  const { data: channelMembers = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["dashboard-channel-attendance-members", currentChannel?.channel_name],
    enabled: !!currentChannel?.channel_name && open,
    queryFn: async () => {
      const { data: shoots, error: errShoots } = await supabase
        .from("shootings")
        .select("id, name, shoot_date")
        .eq("channel", currentChannel!.channel_name);
      if (errShoots) throw errShoots;
      const ids = (shoots ?? []).map((s) => s.id);
      if (ids.length === 0) return [];

      const { data: att, error: errAtt } = await supabase
        .from("attendance")
        .select("id, member_id, rate_override, members(id, name, rate)")
        .in("shooting_id", ids)
        .eq("present", true);
      if (errAtt) throw errAtt;

      const map = new Map<string, { id: string; name: string; days: number; earned: number }>();
      for (const a of (att as any[]) ?? []) {
        if (!a.member_id || !a.members) continue;
        const amt = Number(a.rate_override ?? a.members.rate ?? 0);
        const cur = map.get(a.member_id) ?? {
          id: a.member_id,
          name: a.members.name,
          days: 0,
          earned: 0,
        };
        cur.days += 1;
        cur.earned += amt;
        map.set(a.member_id, cur);
      }
      return [...map.values()].sort((a, b) => b.earned - a.earned);
    },
  });

  // Partners for this channel
  const channelPartners = useMemo(() => {
    return ledger.filter((l) => l.channel_id === channelId);
  }, [ledger, channelId]);

  // When opened or default props change, set channel & target
  useEffect(() => {
    if (!open) return;
    const selectedCh = defaultChannelId || (summary.length > 0 ? summary[0].channel_id : "");
    setChannelId(selectedCh);
    setPayType(defaultMode);

    if (defaultMode === "partner") {
      if (defaultPartnerId) {
        setTarget(`p:${defaultPartnerId}`);
      } else {
        const first = ledger.find((l) => l.channel_id === selectedCh);
        if (first) setTarget(`p:${first.partner_id}`);
        else setTarget("");
      }
    } else {
      if (defaultMemberId) {
        setTarget(`m:${defaultMemberId}`);
      } else {
        setTarget("");
      }
    }
    setAmount("");
    setNote("");
  }, [open, defaultChannelId, defaultPartnerId, defaultMemberId, defaultMode, summary, ledger]);

  // Selected partner or member
  const selectedPartner = useMemo(() => {
    if (target.startsWith("p:")) {
      const pId = target.slice(2);
      return channelPartners.find((p) => p.partner_id === pId);
    }
    return undefined;
  }, [target, channelPartners]);

  const selectedMemberId = target.startsWith("m:") ? target.slice(2) : undefined;
  const selectedMember = selectedMemberId
    ? channelMembers.find((m) => m.id === selectedMemberId)
    : undefined;

  // Member balance query
  const { data: memberBalance } = useQuery({
    queryKey: ["balance", selectedMemberId, channelId],
    enabled: open && !!selectedMemberId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("member_balance", {
        _member_id: selectedMemberId!,
        _channel_id: channelId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  // Member accounts query
  const { data: memberAccounts = [] } = useQuery({
    queryKey: ["member_accounts", selectedMemberId],
    enabled: open && !!selectedMemberId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_accounts")
        .select("kind, account_number")
        .eq("member_id", selectedMemberId!);
      if (error) throw error;
      return (data ?? []) as { kind: string; account_number: string }[];
    },
  });

  // When target changes, set default amount & note
  useEffect(() => {
    if (!open) return;
    if (payType === "partner" && selectedPartner) {
      if (selectedPartner.due > 0) {
        setAmount(String(Math.round(selectedPartner.due)));
      } else {
        setAmount("");
      }
      setNote(`${currentChannel?.channel_name || "শেয়ার চ্যানেল"} — লাভ ভাগ পরিশোধ`);
    } else if (payType === "member" && selectedMember) {
      setAmount(String(Math.round(selectedMember.earned)));
      setNote(`${currentChannel?.channel_name || "শেয়ার চ্যানেল"} — শুটিং হাজিরা পরিশোধ`);
    }
  }, [open, payType, selectedPartner, selectedMember, currentChannel?.channel_name]);

  // When method changes, autofill member account
  useEffect(() => {
    if (method === "cash" || payType !== "member") {
      setAccount("");
      return;
    }
    const match = memberAccounts.find((a) => a.kind === method);
    setAccount(match ? match.account_number : "");
  }, [method, memberAccounts, payType]);

  const handleAutoFillDue = () => {
    if (selectedPartner && selectedPartner.due > 0) {
      setAmount(String(Math.round(selectedPartner.due)));
    }
  };

  const handleAutoFillMemberEarned = () => {
    if (selectedMember && selectedMember.earned > 0) {
      setAmount(String(Math.round(selectedMember.earned)));
    }
  };

  const payMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("সঠিক পরিশোধের পরিমাণ লিখুন");
      if (!channelId) throw new Error("শেয়ার চ্যানেল নির্বাচন করুন");
      if (!target) throw new Error("কাকে পেমেন্ট করবেন নির্বাচন করুন");

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");

      if (payType === "partner" || target.startsWith("p:")) {
        const pId = target.slice(2);
        const { error } = await supabase.from("partner_payouts").insert({
          owner_id: u.user.id,
          partner_id: pId,
          amount: amt,
          method,
          bank_account_number: account.trim() || null,
          paid_at: date,
          note: note.trim() || null,
        });
        if (error) throw error;
      } else {
        const mId = target.slice(2);
        const { error } = await supabase.from("payments").insert({
          owner_id: u.user.id,
          member_id: mId,
          channel_id: channelId,
          amount: amt,
          method,
          bank_account_number: account.trim() || null,
          paid_at: date,
          note: note.trim() || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-channel-summary"] });
      qc.invalidateQueries({ queryKey: ["partner-ledger"] });
      qc.invalidateQueries({ queryKey: ["partner-payouts"] });
      qc.invalidateQueries({ queryKey: ["dashboard-recent-partner-payouts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["balance"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      toast.success(
        payType === "member"
          ? "সদস্যের হাজিরা পেমেন্ট সফলভাবে সংরক্ষিত হয়েছে"
          : "অংশীদারের ভাগ পরিশোধ সফলভাবে সংরক্ষিত হয়েছে"
      );
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BadgeDollarSign className="h-5 w-5 text-emerald-600" />
            <span>শেয়ার চ্যানেল পেমেন্ট প্রদান</span>
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            payMutation.mutate();
          }}
          className="space-y-3.5 mt-2"
        >
          {/* Channel Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">শেয়ার চ্যানেল</Label>
            <Select
              value={channelId}
              onValueChange={(val) => {
                setChannelId(val);
                if (payType === "partner") {
                  const first = ledger.find((l) => l.channel_id === val);
                  if (first) setTarget(`p:${first.partner_id}`);
                  else setTarget("");
                } else {
                  setTarget("");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="চ্যানেল নির্বাচন করুন" />
              </SelectTrigger>
              <SelectContent>
                {summary.map((s) => (
                  <SelectItem key={s.channel_id} value={s.channel_id}>
                    {s.channel_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Category Toggle: মালিকের ভাগ vs সদস্যের হাজিরা */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">পেমেন্টের ধরন</Label>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setPayType("partner");
                  const first = channelPartners[0];
                  if (first) setTarget(`p:${first.partner_id}`);
                  else setTarget("");
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
                  payType === "partner"
                    ? "bg-white text-emerald-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <BadgeDollarSign className="h-3.5 w-3.5" />
                <span>মালিকের ভাগ</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPayType("member");
                  const first = channelMembers[0];
                  if (first) setTarget(`m:${first.id}`);
                  else setTarget("");
                }}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition cursor-pointer ${
                  payType === "member"
                    ? "bg-white text-teal-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                <span>সদস্যের হাজিরা আয়</span>
              </button>
            </div>
          </div>

          {/* Recipient Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {payType === "partner" ? "কোন অংশীদারকে পরিশোধ করবেন?" : "কোন সদস্যকে হাজিরা পেমেন্ট করবেন?"}
            </Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue placeholder={payType === "partner" ? "অংশীদার নির্বাচন করুন" : "সদস্য নির্বাচন করুন"} />
              </SelectTrigger>
              <SelectContent>
                {payType === "partner" ? (
                  channelPartners.length > 0 ? (
                    channelPartners.map((p) => (
                      <SelectItem key={p.partner_id} value={`p:${p.partner_id}`}>
                        {p.partner_name} ({toBn(p.share_percent)}%) — বকেয়া: {taka(p.due)}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-xs text-muted-foreground">
                      এই চ্যানেলে কোনো অংশীদার নেই
                    </div>
                  )
                ) : (
                  channelMembers.length > 0 ? (
                    channelMembers.map((m) => (
                      <SelectItem key={m.id} value={`m:${m.id}`}>
                        {m.name} ({toBn(m.days)} দিন হাজিরা — আয়: {taka(m.earned)})
                      </SelectItem>
                    ))
                  ) : (
                    <div className="p-2 text-xs text-muted-foreground">
                      {loadingMembers
                        ? "সদস্যদের হাজিরা লোড হচ্ছে…"
                        : "এই চ্যানেলে কোনো সদস্যের হাজিরা পাওয়া যায়নি"}
                    </div>
                  )
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Selected Partner Status Card */}
          {payType === "partner" && selectedPartner && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">অংশীদার:</span>
                <span className="font-bold text-slate-800">
                  {selectedPartner.partner_name} ({toBn(selectedPartner.share_percent)}%)
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">প্রাপ্য ভাগ:</span>
                <span className="font-semibold text-slate-700">
                  {taka(selectedPartner.entitled)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">পূর্বে পরিশোধিত:</span>
                <span className="font-semibold text-emerald-600">
                  {taka(selectedPartner.paid_total)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                <span className="font-bold text-slate-800">বর্তমান বকেয়া:</span>
                <div className="flex items-center gap-2">
                  <span
                    className={`font-black ${
                      selectedPartner.due > 0 ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {taka(selectedPartner.due)}
                  </span>
                  {selectedPartner.due > 0 && (
                    <button
                      type="button"
                      onClick={handleAutoFillDue}
                      className="rounded bg-rose-100 hover:bg-rose-200 text-rose-800 text-[10px] font-bold px-1.5 py-0.5 transition cursor-pointer"
                    >
                      বকেয়া পূরণ
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Selected Member Status Card */}
          {payType === "member" && selectedMember && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">সদস্যের নাম:</span>
                <span className="font-bold text-slate-800">{selectedMember.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">এই চ্যানেলে শুটিং উপস্থিতি:</span>
                <span className="font-semibold text-teal-800">
                  {toBn(selectedMember.days)} দিন
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">মোট হাজিরা বাবদ আয়:</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-emerald-700">
                    {taka(selectedMember.earned)}
                  </span>
                  <button
                    type="button"
                    onClick={handleAutoFillMemberEarned}
                    className="rounded bg-teal-100 hover:bg-teal-200 text-teal-800 text-[10px] font-bold px-1.5 py-0.5 transition cursor-pointer"
                  >
                    আয় পূরণ
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-teal-200/60">
                <span className="font-semibold text-slate-700">সদস্যের বর্তমান মোট ব্যালেন্স:</span>
                <span className="font-black text-slate-900">
                  {taka(memberBalance ?? 0)}
                </span>
              </div>
            </div>
          )}

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">পরিশোধের পরিমাণ (৳)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>

          {/* Method & Date */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">পরিশোধ মাধ্যম</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(METHOD_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">তারিখ</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Account Number (Optional if not cash) */}
          {method !== "cash" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">হিসাব / মোবাইল নম্বর (ঐচ্ছিক)</Label>
              <Input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="যেমন: ০১৭১XXXXXXX বা ব্যাংক হিসাব"
              />
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">মন্তব্য বা নোট (ঐচ্ছিক)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={payType === "member" ? "যেমন: শুটিং হাজিরা পরিশোধ" : "যেমন: চলতি মাসের লাভ পরিশোধ"}
            />
          </div>

          <Button
            type="submit"
            className={`w-full font-bold ${
              payType === "member"
                ? "bg-teal-600 hover:bg-teal-700 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            }`}
            disabled={payMutation.isPending}
          >
            {payMutation.isPending
              ? "পরিশোধ হচ্ছে…"
              : payType === "member"
              ? "সদস্যকে হাজিরা পরিশোধ করুন"
              : "অংশীদারকে ভাগ পরিশোধ করুন"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
 * 2. QuickSharedIncomeDialog: আয় যোগ করুন
 * ========================================================================= */
function QuickSharedIncomeDialog({
  open,
  onOpenChange,
  defaultChannelId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultChannelId?: string;
}) {
  const qc = useQueryClient();
  const { data: summary = [] } = useSharedSummary();

  const [channelId, setChannelId] = useState<string>("");
  const [source, setSource] = useState<string>("facebook");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [shootingId, setShootingId] = useState<string>("none");
  const [note, setNote] = useState<string>("");

  useMemo(() => {
    if (open) {
      setChannelId(defaultChannelId || (summary.length > 0 ? summary[0].channel_id : ""));
      setAmount("");
      setNote("");
      setShootingId("none");
    }
  }, [open, defaultChannelId, summary]);

  // Channel's shootings
  const currentChannel = summary.find((s) => s.channel_id === channelId);
  const { data: shootings = [] } = useQuery({
    queryKey: ["channel-shootings-for-income", currentChannel?.channel_name],
    enabled: !!currentChannel?.channel_name && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date")
        .eq("channel", currentChannel!.channel_name)
        .order("shoot_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; shoot_date: string }>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("সঠিক আয়ের পরিমাণ লিখুন");
      if (!channelId) throw new Error("চ্যানেল নির্বাচন করুন");

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");

      const { error } = await supabase.from("channel_incomes").insert({
        owner_id: u.user.id,
        channel_id: channelId,
        source: source as any,
        amount: amt,
        earned_at: date,
        shooting_id: shootingId === "none" ? null : shootingId,
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-channel-summary"] });
      qc.invalidateQueries({ queryKey: ["partner-ledger"] });
      qc.invalidateQueries({ queryKey: ["channel-incomes"] });
      qc.invalidateQueries({ queryKey: ["dashboard-recent-channel-incomes"] });
      toast.success("শেয়ার চ্যানেলের আয় যোগ হয়েছে — পার্টনারদের ভাগ স্বয়ংক্রিয় হিসাব হয়েছে");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <span>শেয়ার চ্যানেলে আয় যোগ</span>
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-3.5 mt-2"
        >
          {/* Channel Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">শেয়ার চ্যানেল</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger>
                <SelectValue placeholder="চ্যানেল নির্বাচন করুন" />
              </SelectTrigger>
              <SelectContent>
                {summary.map((s) => (
                  <SelectItem key={s.channel_id} value={s.channel_id}>
                    {s.channel_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Income Source */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">আয়ের উৎস</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">আয়ের পরিমাণ (৳)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">আয়ের তারিখ</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Shooting (Optional) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">সংশ্লিষ্ট শুটিং (ঐচ্ছিক)</Label>
            <Select value={shootingId} onValueChange={setShootingId}>
              <SelectTrigger>
                <SelectValue placeholder="শুটিং বাছুন" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">কোনোটি নয়</SelectItem>
                {shootings.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} ({bnDate(s.shoot_date)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">নোট বা বিবরণ (ঐচ্ছিক)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="যেমন: অক্টোবর মাসের ফেসবুক মনিটাইজেশন আয়"
              rows={2}
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "সংরক্ষণ হচ্ছে…" : "আয় সংরক্ষণ করুন"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* =========================================================================
 * 3. QuickSharedExpenseDialog: ব্যয় যোগ করুন
 * ========================================================================= */
function QuickSharedExpenseDialog({
  open,
  onOpenChange,
  defaultChannelId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultChannelId?: string;
}) {
  const qc = useQueryClient();
  const { data: summary = [] } = useSharedSummary();

  const [channelId, setChannelId] = useState<string>("");
  const [shootingId, setShootingId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState<string>("");

  useMemo(() => {
    if (open) {
      setChannelId(defaultChannelId || (summary.length > 0 ? summary[0].channel_id : ""));
      setAmount("");
      setNote("");
      setShootingId("");
    }
  }, [open, defaultChannelId, summary]);

  const currentChannel = summary.find((s) => s.channel_id === channelId);
  const { data: shootings = [] } = useQuery({
    queryKey: ["channel-shootings-for-expense", currentChannel?.channel_name],
    enabled: !!currentChannel?.channel_name && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date")
        .eq("channel", currentChannel!.channel_name)
        .order("shoot_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; shoot_date: string }>;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("সঠিক ব্যয়ের পরিমাণ লিখুন");
      if (!shootingId) throw new Error("শুটিং নির্বাচন করুন");

      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");

      const { error } = await supabase.from("shooting_expenses").insert({
        owner_id: u.user.id,
        shooting_id: shootingId,
        amount: amt,
        spent_at: new Date(`${date}T12:00:00`).toISOString(),
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shared-channel-summary"] });
      qc.invalidateQueries({ queryKey: ["partner-ledger"] });
      qc.invalidateQueries({ queryKey: ["channel-expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("শুটিং ব্যয় সফলভাবে যোগ করা হয়েছে");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Receipt className="h-5 w-5 text-rose-600" />
            <span>শেয়ার চ্যানেলে ব্যয় যোগ</span>
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-3.5 mt-2"
        >
          {/* Channel Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">শেয়ার চ্যানেল</Label>
            <Select
              value={channelId}
              onValueChange={(val) => {
                setChannelId(val);
                setShootingId("");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="চ্যানেল নির্বাচন করুন" />
              </SelectTrigger>
              <SelectContent>
                {summary.map((s) => (
                  <SelectItem key={s.channel_id} value={s.channel_id}>
                    {s.channel_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Shooting Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">শুটিং নির্বাচন করুন</Label>
            <Select value={shootingId} onValueChange={setShootingId}>
              <SelectTrigger>
                <SelectValue placeholder="শুটিং বাছুন" />
              </SelectTrigger>
              <SelectContent>
                {shootings.length > 0 ? (
                  shootings.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({bnDate(s.shoot_date)})
                    </SelectItem>
                  ))
                ) : (
                  <div className="p-2 text-xs text-muted-foreground">
                    এই চ্যানেলে কোনো শুটিং নেই
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">ব্যয়ের পরিমাণ (৳)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              required
            />
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">তারিখ</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">খরচের বিবরণ বা নোট</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="যেমন: স্পট ভাড়া, শুটিং খাবার, যাতায়াত ইত্যাদি"
              rows={2}
            />
          </div>

          <Button
            type="submit"
            className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold"
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? "সংরক্ষণ হচ্ছে…" : "ব্যয় সংরক্ষণ করুন"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
