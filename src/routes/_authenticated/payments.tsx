import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { taka, bnDate, toBn } from "@/lib/format";
import {
  Wallet,
  Landmark,
  Smartphone,
  Copy,
  ChevronDown,
  ChevronUp,
  Handshake,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Receipt,
  Layers,
  BadgeDollarSign,
} from "lucide-react";
import { toast } from "sonner";
import { MemberAvatar } from "@/components/member-avatar";
import { BrandAvatar } from "@/lib/brand";
import { ACCOUNT_KIND_LABEL, type AccountKind } from "@/lib/bd-banks";
import { saveMemberAccountIfNew } from "@/lib/save-member-account";

export const Route = createFileRoute("/_authenticated/payments")({
  component: PaymentsPage,
});

type Member = { id: string; name: string; type: "daily" | "monthly"; photo_url: string | null };
type PayMethod = "cash" | "bkash" | "nagad" | "rocket" | "upay" | "bank";
type Payment = {
  id: string;
  member_id: string;
  amount: number;
  note: string | null;
  paid_at: string;
  method: PayMethod | null;
  bank_account_number: string | null;
  channel_id: string | null;
  channels: { name: string } | null;
  members: { name: string; photo_url: string | null } | null;
};
type Account = {
  id: string;
  kind: AccountKind;
  bank_name: string | null;
  branch: string | null;
  account_holder: string | null;
  account_number: string;
};

type SharedChannelBalance = {
  channel_id: string;
  channel_name: string;
  logo_url: string | null;
  balance: number;
  earned: number;
  paid: number;
};

const METHOD_LABEL: Record<PayMethod, string> = {
  cash: "ক্যাশ",
  bkash: "বিকাশ",
  nagad: "নগদ",
  rocket: "রকেট",
  upay: "উপায়",
  bank: "ব্যাংক",
};

const PAYMENT_SELECT =
  "id, member_id, amount, note, paid_at, method, bank_account_number, channel_id, channels(name), members(name, photo_url)";

function PaymentsPage() {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState<string>("all");
  // targetChannelId: null means Main Account; string means specific shared channel
  const [targetChannelId, setTargetChannelId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [bankAcct, setBankAcct] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<"all" | "main" | "shared">("all");
  const [combinedOpen, setCombinedOpen] = useState(false);

  // 1. Fetch Members
  const { data: members = [] } = useQuery({
    queryKey: ["members-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, type, photo_url")
        .order("name");
      if (error) throw error;
      return data as Member[];
    },
  });

  // 2. Fetch General Main Balance
  const balance = useQuery({
    queryKey: ["balance", memberId],
    enabled: !!memberId && memberId !== "all",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("member_balance", { _member_id: memberId, _channel_id: null });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  // 3. Fetch Member Accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["member_accounts", memberId],
    enabled: !!memberId && memberId !== "all",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_accounts")
        .select("id, kind, bank_name, branch, account_holder, account_number")
        .eq("member_id", memberId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Account[];
    },
  });

  // 4. Fetch Shared Channels
  const { data: sharedChannels = [] } = useQuery({
    queryKey: ["shared-channels-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, name, logo_url")
        .eq("is_shared", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; logo_url: string | null }[];
    },
  });

  // 5. Fetch Member's Balances & Earnings for each Shared Channel
  const { data: memberSharedBalances = [], isLoading: sharedBalancesLoading } = useQuery({
    queryKey: ["member-shared-balances", memberId, sharedChannels.map((c) => c.id).join(",")],
    enabled: !!memberId && memberId !== "all" && sharedChannels.length > 0,
    queryFn: async () => {
      const list: SharedChannelBalance[] = [];
      for (const ch of sharedChannels) {
        const [{ data: balData }, { data: paidData }] = await Promise.all([
          supabase.rpc("member_balance", {
            _member_id: memberId,
            _channel_id: ch.id,
          }),
          supabase
            .from("payments")
            .select("amount")
            .eq("member_id", memberId)
            .eq("channel_id", ch.id),
        ]);

        const balanceVal = Number(balData ?? 0);
        const paidVal = (paidData ?? []).reduce((acc, p) => acc + Number(p.amount || 0), 0);
        const earnedVal = balanceVal + paidVal;

        list.push({
          channel_id: ch.id,
          channel_name: ch.name,
          logo_url: ch.logo_url,
          balance: balanceVal,
          earned: earnedVal,
          paid: paidVal,
        });
      }
      return list;
    },
  });

  const mainBalance = balance.data ?? 0;
  const totalSharedDue = memberSharedBalances.reduce((acc, c) => acc + Math.max(0, c.balance), 0);
  const grandTotalDue = Math.max(0, mainBalance) + totalSharedDue;

  // Selected Shared Channel if any
  const selectedSharedChannel = memberSharedBalances.find((c) => c.channel_id === targetChannelId);

  // 6. Payments History
  const PAGE = memberId === "all" ? 50 : 15;
  const { data: payments = [] } = useQuery({
    queryKey: ["payments", "list", memberId, showAll],
    queryFn: async () => {
      const q =
        memberId === "all"
          ? supabase
              .from("payments")
              .select(PAYMENT_SELECT)
              .order("paid_at", { ascending: false })
              .limit(showAll ? 1000 : PAGE)
          : supabase
              .from("payments")
              .select(PAYMENT_SELECT)
              .eq("member_id", memberId)
              .order("paid_at", { ascending: false })
              .limit(showAll ? 1000 : PAGE);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Payment[];
    },
  });

  const filteredPayments = payments.filter((p) => {
    if (historyFilter === "main") return !p.channel_id;
    if (historyFilter === "shared") return !!p.channel_id;
    return true;
  });

  const hasMore = !showAll && payments.length >= PAGE;

  useEffect(() => {
    if (!memberId && members[0]) setMemberId(members[0].id);
  }, [members, memberId]);

  // When member changes, reset destination to Main Account
  useEffect(() => {
    setTargetChannelId(null);
    setAmount("");
    setNote("");
  }, [memberId]);

  // Auto-fill account number when method matches a saved member account
  useEffect(() => {
    if (method === "cash") {
      setBankAcct("");
      return;
    }
    const match = accounts.find((a) => a.kind === method);
    setBankAcct(match ? match.account_number : "");
  }, [method, accounts]);

  // Handler to select Main Account
  const handleSelectMainAccount = () => {
    setTargetChannelId(null);
    if (mainBalance > 0) {
      setAmount(String(Math.round(mainBalance)));
    } else {
      setAmount("");
    }
    setNote("মূল বেতন/হাজিরা পরিশোধ");
    toast.info("মূল অ্যাকাউন্ট পেমেন্ট মোড সক্রিয় করা হয়েছে");
  };

  // Handler to select Shared Channel
  const handleSelectSharedChannel = (ch: SharedChannelBalance) => {
    setTargetChannelId(ch.channel_id);
    if (ch.balance > 0) {
      setAmount(String(Math.round(ch.balance)));
    } else {
      setAmount("");
    }
    setNote(`${ch.channel_name} — হাজিরা পরিশোধ`);
    toast.info(`${ch.channel_name} শেয়ার চ্যানেলের পেমেন্ট মোড সক্রিয় হয়েছে`);
  };

  // 7. Save Payment Mutation
  const pay = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!memberId || memberId === "all" || !amt || amt <= 0) throw new Error("সঠিক তথ্য দিন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");

      const { error } = await supabase.from("payments").insert({
        owner_id: u.user.id,
        member_id: memberId,
        channel_id: targetChannelId, // null for main, uuid for shared channel
        amount: amt,
        note: note.trim() || null,
        method,
        bank_account_number: method !== "cash" && bankAcct.trim() ? bankAcct.trim() : null,
      });
      if (error) throw error;

      if (method !== "cash" && bankAcct.trim()) {
        await saveMemberAccountIfNew({
          ownerId: u.user.id,
          memberId,
          memberName: members.find((m) => m.id === memberId)?.name ?? null,
          method,
          accountNumber: bankAcct,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["member_accounts"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["balance"] });
      qc.invalidateQueries({ queryKey: ["member-shared-balances"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["dues-breakdown"] });
      qc.invalidateQueries({ queryKey: ["shared-channel-summary"] });
      qc.invalidateQueries({ queryKey: ["partner-ledger"] });
      toast.success(
        selectedSharedChannel
          ? `${selectedSharedChannel.channel_name} এর পেমেন্ট সংরক্ষিত`
          : "পেমেন্ট সংরক্ষিত"
      );
      setAmount("");
      setNote("");
      setBankAcct("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedMember = members.find((m) => m.id === memberId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">পেমেন্ট</h1>
        <p className="text-sm text-muted-foreground">
          সদস্যের মূল বেতন এবং শেয়ার চ্যানেলের হাজিরা পারিশ্রমিক পরিশোধ করুন
        </p>
      </div>

      {/* 1. Member Selection & Quick Balance Overview */}
      <div className="space-y-4 rounded-3xl border bg-card p-4 sm:p-5 shadow-xs">
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-muted-foreground">সদস্য নির্বাচন করুন</Label>
          <Select
            value={memberId}
            onValueChange={(v) => {
              setShowAll(false);
              setMemberId(v);
            }}
          >
            <SelectTrigger className="h-12 rounded-xl text-base">
              <SelectValue placeholder="সদস্য নির্বাচন করুন" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="font-semibold">সব নাম (সবার তালিকা)</span>
              </SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <div className="flex items-center gap-2.5">
                    <MemberAvatar name={m.name} photoUrl={m.photo_url} size="sm" />
                    <span className="font-medium">{m.name}</span>
                    <span className="text-xs text-muted-foreground">
                      ({m.type === "daily" ? "দৈনিক" : "মাসিক"})
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Selected Member Balances (Main + Shared Channels) */}
        {selectedMember && (
          <div className="space-y-3 pt-1">
            {/* Top Member Card with Grand Total */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 shadow-2xs">
              <div className="flex items-center gap-3">
                <MemberAvatar name={selectedMember.name} photoUrl={selectedMember.photo_url} size="lg" />
                <div className="min-w-0">
                  <div className="truncate text-base font-bold text-foreground">
                    {selectedMember.name}
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">
                    পদবি/ধরন: {selectedMember.type === "daily" ? "দৈনিক হাজিরা কর্মী" : "মাসিক বেতনভুক্ত"}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 rounded-xl border border-primary/20 bg-background/95 px-4 py-2 shadow-xs">
                <div className="text-right">
                  <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    সর্বমোট পাওনা (মোট বকেয়া)
                  </div>
                  <div className="font-roboto font-black text-2xl text-primary tracking-tight">
                    {balance.isLoading || sharedBalancesLoading ? "…" : taka(grandTotalDue)}
                  </div>
                </div>
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                  <BadgeDollarSign className="h-5 w-5" />
                </div>
              </div>
            </div>

            {/* SEPARATE BREAKDOWN: Main Balance & Shared Channels */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Box 1: মূল সাধারণ অ্যাকাউন্ট (Regular Main Account) */}
              <div
                className={`relative flex flex-col justify-between rounded-2xl border p-4 transition-all ${
                  targetChannelId === null
                    ? "border-primary bg-primary/10 ring-2 ring-primary/25 shadow-xs"
                    : "border-border/70 bg-card hover:border-primary/40"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-xl bg-primary/15 text-primary">
                        <Wallet className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold">মূল অ্যাকাউন্ট (সাধারণ)</div>
                        <div className="text-[11px] text-muted-foreground">নিয়মিত বেতন ও বোনাস বাবদ</div>
                      </div>
                    </div>
                    {targetChannelId === null && (
                      <Badge className="bg-primary text-primary-foreground font-bold text-[10.5px] px-2 py-0.5">
                        সক্রিয়
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 flex items-baseline justify-between rounded-xl bg-background/80 px-3.5 py-2 border border-border/50">
                    <span className="text-xs font-semibold text-muted-foreground">বর্তমান বকেয়া:</span>
                    <span className="font-roboto font-black text-xl text-primary">
                      {balance.isLoading ? "…" : taka(mainBalance)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {mainBalance > 0 ? "বকেয়া পরিশোধ করতে চান?" : "কোনো বকেয়া নেই"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={targetChannelId === null ? "default" : "outline"}
                    onClick={handleSelectMainAccount}
                    className="h-8 text-xs font-bold rounded-lg"
                  >
                    {targetChannelId === null ? "এই অ্যাকাউন্টে আছেন" : "মূল পেমেন্ট করুন"}
                  </Button>
                </div>
              </div>

              {/* Box 2: শেয়ার চ্যানেল পাওনা ও হাজিরা (Shared Channels Due) */}
              <div className="space-y-2 rounded-2xl border border-purple-500/25 bg-gradient-to-b from-purple-500/10 via-purple-500/5 to-transparent p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-purple-600/15 text-purple-700 dark:text-purple-300">
                      <Handshake className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-foreground">
                        শেয়ার চ্যানেল পাওনা ও পারিশ্রমিক
                      </div>
                      <div className="text-[11px] text-purple-700/80 dark:text-purple-300 font-medium">
                        শুটিং হাজিরা বাবদ চ্যানেলভিত্তিক আয়
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline" className="border-purple-300 text-purple-700 dark:text-purple-300 font-bold text-xs bg-purple-50 dark:bg-purple-950/40">
                    মোট: {taka(totalSharedDue)}
                  </Badge>
                </div>

                {memberSharedBalances.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-purple-300/40 p-4 text-center text-xs text-muted-foreground">
                    কোনো শেয়ার চ্যানেল পাওয়া যায়নি
                  </div>
                ) : (
                  <div className="space-y-2 mt-2">
                    {memberSharedBalances.map((ch) => {
                      const isSelected = targetChannelId === ch.channel_id;
                      return (
                        <div
                          key={ch.channel_id}
                          className={`rounded-xl border p-3 transition-all ${
                            isSelected
                              ? "border-purple-600 bg-purple-500/15 ring-2 ring-purple-500/30 shadow-xs"
                              : "border-purple-200/70 dark:border-purple-800/40 bg-card hover:bg-purple-50/50 dark:hover:bg-purple-950/20"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <BrandAvatar
                                kind="channel"
                                name={ch.channel_name}
                                src={ch.logo_url}
                                size={28}
                              />
                              <div className="min-w-0">
                                <div className="truncate font-bold text-xs sm:text-sm text-foreground">
                                  {ch.channel_name}
                                </div>
                                <div className="text-[10.5px] text-muted-foreground">
                                  আয়: {taka(ch.earned)} • পরিশোধ: {taka(ch.paid)}
                                </div>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="text-[10px] text-muted-foreground font-medium">বকেয়া</div>
                              <div
                                className={`font-roboto font-black text-sm sm:text-base ${
                                  ch.balance > 0
                                    ? "text-purple-700 dark:text-purple-300"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {taka(ch.balance)}
                              </div>
                            </div>
                          </div>

                          <div className="mt-2.5 pt-2 border-t border-purple-200/50 dark:border-purple-800/40 flex items-center justify-between gap-2">
                            <span className="text-[10.5px] text-purple-700/80 dark:text-purple-300 font-medium truncate">
                              {ch.balance > 0 ? "হাজিরা পরিশোধ করুন" : "হাজিরা পরিশোধিত"}
                            </span>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => handleSelectSharedChannel(ch)}
                              className={`h-7 px-2.5 text-xs font-bold rounded-lg ${
                                isSelected
                                  ? "bg-purple-700 text-white"
                                  : "bg-purple-600 hover:bg-purple-700 text-white shadow-2xs"
                              }`}
                            >
                              {isSelected ? "এই চ্যানেলে আছেন" : "এই চ্যানেলের পেমেন্ট করুন"}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Pay Both Together Banner (If member has both main & shared due) */}
            {mainBalance > 0 && totalSharedDue > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-foreground">
                      একত্রে সম্পূর্ণ পরিশোধের সুবিধা
                    </div>
                    <div className="text-xs text-muted-foreground">
                      মূল বকেয়া ({taka(mainBalance)}) এবং শেয়ার চ্যানেল ({taka(totalSharedDue)}) এক ক্লিকেই পরিশোধ করতে পারেন
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setCombinedOpen(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4 rounded-xl shrink-0 shadow-xs"
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  একত্রে সব পরিশোধ করুন ({taka(grandTotalDue)})
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Saved Member Payment Accounts (Copy & Select) */}
        {selectedMember && accounts.length > 0 && (
          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-muted-foreground">
                পেমেন্ট অ্যাকাউন্ট (ক্লিক করে নির্বাচন করুন)
              </div>
              <span className="text-[11px] text-muted-foreground">ক্লিক করলে কপি ও সিলেক্ট হবে</span>
            </div>
            <ul className="space-y-2">
              {accounts.map((a) => {
                const isSelected = method === a.kind && bankAcct === a.account_number;
                return (
                  <li
                    key={a.id}
                    onClick={() => {
                      setMethod(a.kind);
                      setBankAcct(a.account_number);
                      navigator.clipboard.writeText(a.account_number);
                      toast.success(
                        `${a.kind === "bank" ? "ব্যাংক অ্যাকাউন্ট" : ACCOUNT_KIND_LABEL[a.kind]} কপি ও সিলেক্ট করা হয়েছে`
                      );
                    }}
                    className={`group flex cursor-pointer items-start gap-3 rounded-xl border p-2.5 transition-all shadow-xs ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-2 ring-primary/25"
                        : "border-border/70 bg-card hover:border-primary/40 hover:bg-muted/40"
                    }`}
                  >
                    <span
                      className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl transition ${
                        a.kind === "bank"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                          : "bg-primary/15 text-primary"
                      }`}
                    >
                      {a.kind === "bank" ? <Landmark className="h-4.5 w-4.5" /> : <Smartphone className="h-4.5 w-4.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold">
                          {ACCOUNT_KIND_LABEL[a.kind]}
                          {a.kind === "bank" && a.bank_name ? ` — ${a.bank_name}` : ""}
                        </span>
                        {isSelected && (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground leading-none">
                            সিলেক্টেড
                          </span>
                        )}
                      </div>

                      <div className="mt-1 flex items-center gap-2">
                        <div
                          className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 font-roboto text-sm md:text-base font-black tracking-wider transition ${
                            a.kind === "bank"
                              ? "bg-amber-500/15 border-amber-500/40 text-amber-900 dark:text-amber-200 group-hover:bg-amber-500/25"
                              : "bg-primary/15 border-primary/40 text-primary group-hover:bg-primary/25"
                          }`}
                        >
                          <span className="font-roboto">{a.account_number}</span>
                          <Copy className="h-3.5 w-3.5 opacity-70 group-hover:opacity-100" />
                        </div>
                      </div>

                      {(a.account_holder || a.branch) && (
                        <div className="mt-1 text-xs text-muted-foreground font-medium">
                          {a.account_holder && (
                            <span>
                              হোল্ডার: <strong className="text-foreground/80">{a.account_holder}</strong>
                            </span>
                          )}
                          {a.account_holder && a.branch ? " • " : ""}
                          {a.branch && <span>শাখা: {a.branch}</span>}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary transition"
                      aria-label="কপি"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(a.account_number);
                        toast.success("নম্বর কপি হয়েছে");
                      }}
                      title="নম্বর কপি করুন"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Destination / Account Selector Inside Form */}
        {selectedMember && (
          <div className="space-y-1.5 pt-2 border-t">
            <Label className="text-xs font-bold text-muted-foreground">
              পেমেন্টের খাত / অ্যাকাউন্ট নির্বাচন
            </Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSelectMainAccount}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                  targetChannelId === null
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "border-border bg-card hover:bg-muted/50 text-foreground"
                }`}
              >
                <Wallet className="h-3.5 w-3.5" />
                <span>মূল অ্যাকাউন্ট (সাধারণ)</span>
                <span className="ml-1 opacity-90 font-roboto">
                  ({taka(mainBalance)})
                </span>
              </button>

              {memberSharedBalances.map((ch) => {
                const active = targetChannelId === ch.channel_id;
                return (
                  <button
                    key={ch.channel_id}
                    type="button"
                    onClick={() => handleSelectSharedChannel(ch)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition ${
                      active
                        ? "border-purple-600 bg-purple-600 text-white shadow-xs"
                        : "border-purple-300 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/30 hover:bg-purple-100/60 text-purple-900 dark:text-purple-200"
                    }`}
                  >
                    <Handshake className="h-3.5 w-3.5" />
                    <span>{ch.channel_name} (শেয়ার চ্যানেল)</span>
                    <span className="ml-1 opacity-90 font-roboto">
                      ({taka(ch.balance)})
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Visual Notice for Destination */}
            {selectedSharedChannel ? (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 p-2.5 text-xs text-purple-900 dark:text-purple-200">
                <Handshake className="h-4 w-4 text-purple-600 shrink-0" />
                <div>
                  <strong>{selectedSharedChannel.channel_name}</strong> শেয়ার চ্যানেলের পেমেন্ট মোড। এই টাকাটি উক্ত শেয়ার চ্যানেলের খরচে ও ব্যালেন্সে অন্তর্ভুক্ত হবে।
                </div>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 p-2.5 text-xs text-primary dark:text-primary">
                <Wallet className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <strong>মূল অ্যাকাউন্ট</strong> পেমেন্ট মোড। এটি সাধারণ বেতন ও বোনাসের সাধারণ ব্যালেন্স থেকে কর্তন হবে।
                </div>
              </div>
            )}
          </div>
        )}

        {/* Amount Input */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-bold">পরিমাণ (Tk)</Label>
            {selectedMember && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const due = selectedSharedChannel ? selectedSharedChannel.balance : mainBalance;
                    if (due > 0) setAmount(String(Math.round(due)));
                  }}
                  className="text-[11px] font-bold text-primary hover:underline"
                >
                  পুরো বকেয়া বসান ({selectedSharedChannel ? taka(selectedSharedChannel.balance) : taka(mainBalance)})
                </button>
              </div>
            )}
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-roboto font-black text-xl text-primary">
              ৳
            </span>
            <Input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              className="h-12 pl-9 font-roboto font-bold text-xl tracking-wide border-primary/30 focus-visible:ring-primary shadow-xs"
            />
          </div>
        </div>

        {/* Payment Method */}
        <div className="space-y-1.5">
          <Label className="text-xs font-bold">পেমেন্ট মাধ্যম</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as PayMethod)}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {METHOD_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Account Number if non-cash */}
        {method !== "cash" && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold">
                {method === "bank" ? "ব্যাংক অ্যাকাউন্ট নম্বর" : `${METHOD_LABEL[method]} নম্বর`}
              </Label>
              {bankAcct && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(bankAcct);
                    toast.success("নম্বর কপি হয়েছে");
                  }}
                  className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <Copy className="h-3 w-3" /> কপি
                </button>
              )}
            </div>
            <Input
              type="tel"
              inputMode="numeric"
              value={bankAcct}
              onChange={(e) => setBankAcct(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={method === "bank" ? "ব্যাংক অ্যাকাউন্ট নম্বর দিন" : "01XXXXXXXXX"}
              className={`h-11 font-roboto font-bold text-base tracking-widest shadow-xs ${
                method === "bank"
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-950 dark:text-amber-100 focus-visible:ring-amber-500"
                  : "bg-primary/10 border-primary/40 text-foreground focus-visible:ring-primary"
              }`}
            />
          </div>
        )}

        {/* Note with Quick Chips */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold">নোট (ঐচ্ছিক)</Label>
            <div className="flex items-center gap-1">
              {["হাজিরা পরিশোধ", "বেতন পরিশোধ", "অগ্রিম প্রদান"].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setNote(preset)}
                  className="rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="পেমেন্ট সংক্রান্ত কোনো বিবরণ বা নোট..."
          />
        </div>

        {/* Submit Button */}
        <Button
          className={`w-full h-12 rounded-xl text-base font-bold shadow-md transition-all ${
            selectedSharedChannel
              ? "bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/25"
              : ""
          }`}
          onClick={() => pay.mutate()}
          disabled={pay.isPending || !memberId || memberId === "all" || !amount}
        >
          {pay.isPending ? (
            "সংরক্ষণ হচ্ছে…"
          ) : selectedSharedChannel ? (
            <>
              <Handshake className="mr-2 h-5 w-5" />
              {selectedSharedChannel.channel_name} এর পেমেন্ট সংরক্ষণ করুন
            </>
          ) : (
            "পেমেন্ট সংরক্ষণ করুন (মূল অ্যাকাউন্ট)"
          )}
        </Button>
      </div>

      {/* 2. Combined Pay Dialog */}
      {selectedMember && (
        <CombinedPayDialog
          open={combinedOpen}
          onOpenChange={setCombinedOpen}
          member={selectedMember}
          mainBalance={mainBalance}
          sharedBalances={memberSharedBalances}
          accounts={accounts}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["member_accounts"] });
            qc.invalidateQueries({ queryKey: ["payments"] });
            qc.invalidateQueries({ queryKey: ["balance"] });
            qc.invalidateQueries({ queryKey: ["member-shared-balances"] });
            qc.invalidateQueries({ queryKey: ["balances"] });
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            qc.invalidateQueries({ queryKey: ["dues-breakdown"] });
            qc.invalidateQueries({ queryKey: ["shared-channel-summary"] });
            qc.invalidateQueries({ queryKey: ["partner-ledger"] });
          }}
        />
      )}

      {/* 3. Payments History */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-bold text-muted-foreground">
            {memberId === "all"
              ? showAll
                ? "সব পেমেন্ট (সকল সদস্য)"
                : "সাম্প্রতিক পেমেন্ট (সকল সদস্য)"
              : `${showAll ? "সব" : "সাম্প্রতিক"} পেমেন্ট — ${selectedMember?.name ?? ""}`}
          </h2>

          {/* Filter Tabs for History */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setHistoryFilter("all")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                historyFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              সব ({payments.length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryFilter("main")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                historyFilter === "main"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              মূল অ্যাকাউন্ট ({payments.filter((p) => !p.channel_id).length})
            </button>
            <button
              type="button"
              onClick={() => setHistoryFilter("shared")}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                historyFilter === "shared"
                  ? "bg-purple-600 text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              শেয়ার চ্যানেল ({payments.filter((p) => !!p.channel_id).length})
            </button>
          </div>
        </div>

        {filteredPayments.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            এখনও কোনো পেমেন্ট রেকর্ড নেই
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPayments.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border bg-card p-3 shadow-xs hover:border-border transition"
              >
                <MemberAvatar name={p.members?.name ?? "?"} photoUrl={p.members?.photo_url} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="truncate font-bold text-sm text-foreground">
                        {p.members?.name ?? "সদস্য"}
                      </div>
                      {p.channels?.name ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-300 font-bold text-[10px]"
                        >
                          <Handshake className="h-3 w-3 mr-1 inline" />
                          {p.channels.name}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="shrink-0 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 text-[10px]"
                        >
                          মূল
                        </Badge>
                      )}
                    </div>

                    <div className="font-roboto font-black text-base text-success tracking-tight bg-success/10 px-2.5 py-0.5 rounded-lg border border-success/20 shrink-0">
                      {taka(p.amount)}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground mt-1">
                    <span className="truncate flex items-center gap-1.5">
                      <span className="font-medium">{METHOD_LABEL[(p.method ?? "cash") as PayMethod]}</span>
                      {p.bank_account_number ? (
                        <span className="font-roboto font-bold text-foreground/90 bg-muted px-1.5 py-0.5 rounded text-[11px] tracking-wider border">
                          {p.bank_account_number}
                        </span>
                      ) : null}
                      {p.note ? <span className="truncate">• {p.note}</span> : null}
                    </span>
                    <span className="font-roboto font-medium shrink-0">{bnDate(p.paid_at)}</span>
                  </div>
                </div>
              </div>
            ))}

            {hasMore && (
              <Button variant="outline" className="w-full gap-2 rounded-xl" onClick={() => setShowAll(true)}>
                <ChevronDown className="h-4 w-4" /> সব পেমেন্ট দেখুন
              </Button>
            )}
            {showAll && payments.length > PAGE && (
              <Button variant="outline" className="w-full gap-2 rounded-xl" onClick={() => setShowAll(false)}>
                <ChevronUp className="h-4 w-4" /> কম দেখুন
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Combined Pay Dialog: Pay both Main Balance & Shared Channels at once
// -----------------------------------------------------------------------------
function CombinedPayDialog({
  open,
  onOpenChange,
  member,
  mainBalance,
  sharedBalances,
  accounts,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: Member;
  mainBalance: number;
  sharedBalances: SharedChannelBalance[];
  accounts: Account[];
  onSuccess: () => void;
}) {
  const [mainAmt, setMainAmt] = useState("");
  const [sharedAmts, setSharedAmts] = useState<Record<string, string>>({});
  const [method, setMethod] = useState<PayMethod>("cash");
  const [bankAcct, setBankAcct] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize amounts when dialog opens
  useEffect(() => {
    if (!open) return;
    setMainAmt(mainBalance > 0 ? String(Math.round(mainBalance)) : "0");
    const initShared: Record<string, string> = {};
    for (const ch of sharedBalances) {
      initShared[ch.channel_id] = ch.balance > 0 ? String(Math.round(ch.balance)) : "0";
    }
    setSharedAmts(initShared);
  }, [open, mainBalance, sharedBalances]);

  // Auto-fill account number
  useEffect(() => {
    if (method === "cash") {
      setBankAcct("");
      return;
    }
    const match = accounts.find((a) => a.kind === method);
    setBankAcct(match ? match.account_number : "");
  }, [method, accounts]);

  const numMain = Number(mainAmt) || 0;
  const numSharedTotal = Object.values(sharedAmts).reduce((acc, v) => acc + (Number(v) || 0), 0);
  const totalCombined = numMain + numSharedTotal;

  const handleCombinedSubmit = async () => {
    if (totalCombined <= 0) {
      toast.error("পরিশোধের পরিমাণ দিন");
      return;
    }

    try {
      setIsSubmitting(true);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");

      // 1. Pay Main Account if amount > 0
      if (numMain > 0) {
        const { error } = await supabase.from("payments").insert({
          owner_id: u.user.id,
          member_id: member.id,
          channel_id: null,
          amount: numMain,
          method,
          bank_account_number: method !== "cash" && bankAcct.trim() ? bankAcct.trim() : null,
          note: "মূল বেতন/হাজিরা পরিশোধ (একত্রে)",
        });
        if (error) throw error;
      }

      // 2. Pay Each Shared Channel if amount > 0
      for (const ch of sharedBalances) {
        const chAmt = Number(sharedAmts[ch.channel_id]) || 0;
        if (chAmt > 0) {
          const { error } = await supabase.from("payments").insert({
            owner_id: u.user.id,
            member_id: member.id,
            channel_id: ch.channel_id,
            amount: chAmt,
            method,
            bank_account_number: method !== "cash" && bankAcct.trim() ? bankAcct.trim() : null,
            note: `${ch.channel_name} — হাজিরা পরিশোধ (একত্রে)`,
          });
          if (error) throw error;
        }
      }

      // 3. Save Account if new
      if (method !== "cash" && bankAcct.trim()) {
        await saveMemberAccountIfNew({
          ownerId: u.user.id,
          memberId: member.id,
          memberName: member.name,
          method,
          accountNumber: bankAcct,
        });
      }

      toast.success(`একত্রে মোট ${taka(totalCombined)} সফলভাবে পরিশোধ করা হয়েছে`);
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "পেমেন্ট সংরক্ষণ করতে সমস্যা হয়েছে");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            {member.name} — একত্রে সম্পূর্ণ পরিশোধ
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <p className="text-xs text-muted-foreground">
            একই সাথে মূল অ্যাকাউন্ট ও সকল শেয়ার চ্যানেলের পারিশ্রমিক পৃথকভাবে স্বয়ংক্রিয়ভাবে পরিশোধ হবে:
          </p>

          {/* Breakdown inputs */}
          <div className="space-y-3 rounded-2xl border bg-muted/30 p-3.5">
            {/* Main Account */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-foreground">
                  <Wallet className="h-3.5 w-3.5 text-primary" />
                  মূল অ্যাকাউন্ট (সাধারণ)
                </span>
                <span className="text-muted-foreground">বকেয়া: {taka(mainBalance)}</span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-roboto font-bold text-sm text-primary">
                  ৳
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={mainAmt}
                  onChange={(e) => setMainAmt(e.target.value.replace(/[^0-9.]/g, ""))}
                  className="h-10 pl-8 font-roboto font-bold text-sm"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Shared Channels */}
            {sharedBalances.map((ch) => (
              <div key={ch.channel_id} className="space-y-1 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5 text-purple-700 dark:text-purple-300">
                    <Handshake className="h-3.5 w-3.5" />
                    {ch.channel_name} (শেয়ার চ্যানেল)
                  </span>
                  <span className="text-muted-foreground">বকেয়া: {taka(ch.balance)}</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-roboto font-bold text-sm text-purple-600">
                    ৳
                  </span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={sharedAmts[ch.channel_id] ?? ""}
                    onChange={(e) =>
                      setSharedAmts({
                        ...sharedAmts,
                        [ch.channel_id]: e.target.value.replace(/[^0-9.]/g, ""),
                      })
                    }
                    className="h-10 pl-8 font-roboto font-bold text-sm border-purple-300"
                    placeholder="0"
                  />
                </div>
              </div>
            ))}

            {/* Total */}
            <div className="pt-2 border-t flex items-center justify-between">
              <span className="text-sm font-bold">একত্রে সর্বমোট পরিশোধ:</span>
              <span className="font-roboto font-black text-xl text-emerald-600 dark:text-emerald-400">
                {taka(totalCombined)}
              </span>
            </div>
          </div>

          {/* Payment Method */}
          <div className="space-y-1.5">
            <Label className="text-xs font-bold">পেমেন্ট মাধ্যম</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PayMethod)}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Non-cash account number */}
          {method !== "cash" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">
                {method === "bank" ? "ব্যাংক অ্যাকাউন্ট নম্বর" : `${METHOD_LABEL[method]} নম্বর`}
              </Label>
              <Input
                type="tel"
                value={bankAcct}
                onChange={(e) => setBankAcct(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={method === "bank" ? "অ্যাকাউন্ট নম্বর" : "01XXXXXXXXX"}
                className="h-10 font-roboto font-bold tracking-wider"
              />
            </div>
          )}
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            বাতিল
          </Button>
          <Button
            onClick={handleCombinedSubmit}
            disabled={isSubmitting || totalCombined <= 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
          >
            {isSubmitting ? "পরিশোধ হচ্ছে…" : `একত্রে ${taka(totalCombined)} নিশ্চিত করুন`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
