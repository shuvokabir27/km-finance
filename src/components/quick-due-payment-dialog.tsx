import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { saveMemberAccountIfNew } from "@/lib/save-member-account";
import { ACCOUNT_KIND_LABEL, type AccountKind } from "@/lib/bd-banks";
import { taka, toBn, bnDate } from "@/lib/format";
import { MemberAvatar } from "@/components/member-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  Landmark,
  Smartphone,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Search,
  Receipt,
  UserCheck,
  Handshake,
} from "lucide-react";
import { toast } from "sonner";

export type PayMethod = "cash" | "bkash" | "nagad" | "rocket" | "upay" | "bank";

export const METHOD_LABEL: Record<PayMethod, string> = {
  cash: "ক্যাশ",
  bkash: "বিকাশ",
  nagad: "নগদ",
  rocket: "রকেট",
  upay: "উপায়",
  bank: "ব্যাংক",
};

type Member = {
  id: string;
  name: string;
  photo_url: string | null;
  phone?: string | null;
  type?: "daily" | "monthly";
};

type Account = {
  id: string;
  kind: AccountKind;
  bank_name: string | null;
  branch: string | null;
  account_holder: string | null;
  account_number: string;
};

type QuickDuePaymentDialogProps = {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultMemberId?: string;
  membersWithDue?: Array<{
    id: string;
    name: string;
    photo_url: string | null;
    total: number;
    prev?: number;
    curr?: number;
  }>;
};

export function QuickDuePaymentDialog({
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  defaultMemberId,
  membersWithDue,
}: QuickDuePaymentDialogProps) {
  const qc = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (isControlled) {
      setControlledOpen?.(v);
    } else {
      setInternalOpen(v);
    }
  };

  const [memberId, setMemberId] = useState<string>(defaultMemberId ?? "");
  const [targetChannelId, setTargetChannelId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [bankAcct, setBankAcct] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");

  // Fetch all members list
  const { data: members = [] } = useQuery({
    queryKey: ["members-min"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, type, photo_url, phone")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  // Fetch Shared Channels
  const { data: sharedChannels = [] } = useQuery({
    queryKey: ["shared-channels-list"],
    enabled: open,
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

  // Fetch Member's Shared Channel Balances
  const { data: memberSharedBalances = [] } = useQuery({
    queryKey: ["member-shared-balances", memberId, sharedChannels.map((c) => c.id).join(",")],
    enabled: open && !!memberId && sharedChannels.length > 0,
    queryFn: async () => {
      const list: { channel_id: string; channel_name: string; balance: number }[] = [];
      for (const ch of sharedChannels) {
        const { data: balData } = await supabase.rpc("member_balance", {
          _member_id: memberId,
          _channel_id: ch.id,
        });
        list.push({
          channel_id: ch.id,
          channel_name: ch.name,
          balance: Number(balData ?? 0),
        });
      }
      return list;
    },
  });

  // Fetch shared channel balances for all members
  const allMembersSharedDuesQuery = useQuery({
    queryKey: ["all-members-shared-dues", sharedChannels.map((c) => c.id).join(",")],
    enabled: open && sharedChannels.length > 0,
    queryFn: async () => {
      const sharedChannelNames = sharedChannels.map((c) => c.name);
      const { data: shoots, error: sErr } = await supabase
        .from("shootings")
        .select("id, channel")
        .in("channel", sharedChannelNames);
      if (sErr) throw sErr;
      if (!shoots || shoots.length === 0) return {};

      const shootIdToChannelName = new Map<string, string>();
      for (const s of shoots) {
        if (s.channel) shootIdToChannelName.set(s.id, s.channel);
      }
      const shootIds = shoots.map((s) => s.id);

      const { data: atts, error: aErr } = await supabase
        .from("attendance")
        .select("member_id, rate_override, shooting_id, members(rate)")
        .in("shooting_id", shootIds)
        .eq("present", true);
      if (aErr) throw aErr;

      const sharedChannelIds = sharedChannels.map((c) => c.id);
      const { data: pays, error: pErr } = await supabase
        .from("payments")
        .select("member_id, channel_id, amount")
        .in("channel_id", sharedChannelIds);
      if (pErr) throw pErr;

      const nameToId = new Map<string, string>();
      for (const ch of sharedChannels) {
        nameToId.set(ch.name, ch.id);
      }

      const earnedMap: Record<string, Record<string, number>> = {};
      for (const a of atts ?? []) {
        if (!a.member_id || !a.shooting_id) continue;
        const chName = shootIdToChannelName.get(a.shooting_id);
        if (!chName) continue;
        const chId = nameToId.get(chName);
        if (!chId) continue;

        const rate = Number(a.rate_override ?? (a.members as any)?.rate ?? 0);
        if (!earnedMap[a.member_id]) earnedMap[a.member_id] = {};
        earnedMap[a.member_id][chId] = (earnedMap[a.member_id][chId] ?? 0) + rate;
      }

      const paidMap: Record<string, Record<string, number>> = {};
      for (const p of pays ?? []) {
        if (!p.member_id || !p.channel_id) continue;
        if (!paidMap[p.member_id]) paidMap[p.member_id] = {};
        paidMap[p.member_id][p.channel_id] = (paidMap[p.member_id][p.channel_id] ?? 0) + Number(p.amount ?? 0);
      }

      const out: Record<string, { total: number; byChannel: Record<string, number> }> = {};
      const allMemberIds = new Set([...Object.keys(earnedMap), ...Object.keys(paidMap)]);
      for (const mId of allMemberIds) {
        let memberTotal = 0;
        const byChannel: Record<string, number> = {};
        for (const ch of sharedChannels) {
          const earned = earnedMap[mId]?.[ch.id] ?? 0;
          const paid = paidMap[mId]?.[ch.id] ?? 0;
          const bal = Math.max(0, earned - paid);
          if (bal > 0) {
            memberTotal += bal;
            byChannel[ch.id] = bal;
          }
        }
        if (memberTotal > 0) {
          out[mId] = { total: memberTotal, byChannel };
        }
      }
      return out;
    },
  });

  // Calculate or use member balances
  const balancesQuery = useQuery({
    queryKey: ["balances", members.map((m) => m.id).join(",")],
    enabled: open && !membersWithDue && members.length > 0,
    queryFn: async () => {
      const out: Record<string, number> = {};
      await Promise.all(
        members.map(async (m) => {
          const { data } = await supabase.rpc("member_balance", { _member_id: m.id, _channel_id: null });
          out[m.id] = Number(data ?? 0);
        }),
      );
      return out;
    },
  });

  const sharedDuesData = allMembersSharedDuesQuery.data ?? {};

  // Map memberId -> total due balance (Main Due + Shared Channels Due)
  const dueMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      let mainDue = 0;
      if (membersWithDue) {
        const found = membersWithDue.find((x) => x.id === m.id);
        mainDue = found ? found.total : 0;
      } else if (balancesQuery.data) {
        mainDue = balancesQuery.data[m.id] ?? 0;
      }
      const sharedDue = sharedDuesData[m.id]?.total ?? 0;
      const total = Math.max(0, mainDue) + sharedDue;
      map.set(m.id, total);
    }
    return map;
  }, [members, membersWithDue, balancesQuery.data, sharedDuesData]);

  // Sort members: Members with due > 0 first (highest due first), then others alphabetically
  const sortedMembers = useMemo(() => {
    return [...members].sort((a, b) => {
      const dueA = dueMap.get(a.id) ?? 0;
      const dueB = dueMap.get(b.id) ?? 0;
      if (dueA > 0 && dueB <= 0) return -1;
      if (dueB > 0 && dueA <= 0) return 1;
      if (dueA > 0 && dueB > 0) return dueB - dueA;
      return a.name.localeCompare(b.name, "bn");
    });
  }, [members, dueMap]);

  // Filtered members for search
  const filteredMembers = useMemo(() => {
    if (!search.trim()) return sortedMembers;
    const q = search.trim().toLowerCase();
    return sortedMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.phone && m.phone.includes(q)),
    );
  }, [sortedMembers, search]);

  // Members that have pending dues (for quick-pick chips)
  const dueMembersList = useMemo(() => {
    return sortedMembers.filter((m) => (dueMap.get(m.id) ?? 0) > 0);
  }, [sortedMembers, dueMap]);

  const selectedMember = useMemo(
    () => members.find((m) => m.id === memberId),
    [members, memberId],
  );

  const memberSharedInfo = memberId ? sharedDuesData[memberId] : undefined;
  const memberSharedTotal = useMemo(() => {
    const fromList = memberSharedBalances.reduce((sum, ch) => sum + Math.max(0, ch.balance), 0);
    return fromList > 0 ? fromList : (memberSharedInfo?.total ?? 0);
  }, [memberSharedBalances, memberSharedInfo]);

  const memberMainDue = useMemo(() => {
    if (!memberId) return 0;
    if (membersWithDue) {
      const found = membersWithDue.find((x) => x.id === memberId);
      return found ? found.total : 0;
    }
    return balancesQuery.data?.[memberId] ?? 0;
  }, [memberId, membersWithDue, balancesQuery.data]);

  const totalDue = memberId ? (dueMap.get(memberId) ?? 0) : 0;

  const selectedAccountDue = useMemo(() => {
    if (!targetChannelId) return memberMainDue;
    const ch = memberSharedBalances.find((c) => c.channel_id === targetChannelId);
    if (ch) return ch.balance;
    return memberSharedInfo?.byChannel?.[targetChannelId] ?? 0;
  }, [targetChannelId, memberMainDue, memberSharedBalances, memberSharedInfo]);

  const currentDue = totalDue;

  // Selected member saved accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ["member_accounts", memberId],
    enabled: !!memberId && open,
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

  // Selected member last payment info
  const { data: lastPayment } = useQuery({
    queryKey: ["member-last-payment", memberId],
    enabled: !!memberId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("amount, paid_at, method")
        .eq("member_id", memberId)
        .order("paid_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null;
      return data as { amount: number; paid_at: string; method: string | null } | null;
    },
  });

  // When dialog opens or member selected, initialize fields
  const handleSelectMember = (id: string) => {
    setMemberId(id);
    let mMain = 0;
    if (membersWithDue) {
      const found = membersWithDue.find((x) => x.id === id);
      mMain = found ? found.total : 0;
    } else if (balancesQuery.data) {
      mMain = balancesQuery.data[id] ?? 0;
    }

    const shInfo = sharedDuesData[id];
    const shTotal = shInfo?.total ?? 0;

    // If main due is 0 but there is shared channel due, auto-select that channel!
    if (mMain <= 0 && shTotal > 0 && shInfo?.byChannel) {
      const firstChId = Object.keys(shInfo.byChannel)[0];
      const chBal = shInfo.byChannel[firstChId];
      const chObj = sharedChannels.find((c) => c.id === firstChId);
      setTargetChannelId(firstChId);
      setAmount(chBal > 0 ? String(Math.round(chBal)) : "");
      setNote(`${chObj?.name ?? "শেয়ার চ্যানেল"} — হাজিরা পরিশোধ`);
    } else {
      setTargetChannelId(null);
      if (mMain > 0) {
        setAmount(String(Math.round(mMain)));
        setNote("বেতন/হাজিরা পরিশোধ");
      } else {
        const tot = dueMap.get(id) ?? 0;
        setAmount(tot > 0 ? String(Math.round(tot)) : "");
        setNote("");
      }
    }
  };

  // Reset or initialize when opening
  const handleOpenChange = (v: boolean) => {
    if (v) {
      if (defaultMemberId) {
        handleSelectMember(defaultMemberId);
      } else if (!memberId && dueMembersList.length > 0) {
        // Auto-select first member with due
        handleSelectMember(dueMembersList[0].id);
      }
      setDate(new Date().toISOString().slice(0, 10));
    } else {
      setSearch("");
    }
    setOpen(v);
  };

  // Sync member when opened controlled with defaultMemberId
  useEffect(() => {
    if (open && defaultMemberId) {
      handleSelectMember(defaultMemberId);
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, defaultMemberId, dueMap]);

  // Auto-fill account number when method matches a saved member account
  useEffect(() => {
    if (method === "cash") {
      setBankAcct("");
      return;
    }
    const match = accounts.find((a) => a.kind === method);
    if (match) {
      setBankAcct(match.account_number);
    }
  }, [method, accounts]);

  const savePayment = useMutation({
    mutationFn: async () => {
      if (!memberId) throw new Error("অনুগ্রহ করে সদস্য নির্বাচন করুন");
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("সঠিক টাকার পরিমাণ দিন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");

      // Save payment
      const { error } = await supabase.from("payments").insert({
        owner_id: u.user.id,
        member_id: memberId,
        channel_id: targetChannelId,
        amount: amt,
        paid_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        note: note.trim() || null,
        method,
        bank_account_number: method !== "cash" && bankAcct.trim() ? bankAcct.trim() : null,
      });
      if (error) throw error;

      // Automatically save account if new
      if (method !== "cash" && bankAcct.trim()) {
        await saveMemberAccountIfNew({
          ownerId: u.user.id,
          memberId,
          memberName: selectedMember?.name ?? null,
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
        `৳ ${toBn(Number(amount).toLocaleString("en-IN"))} পেমেন্ট সংরক্ষিত — ${selectedMember?.name ?? ""}`,
      );
      setOpen(false);
      setAmount("");
      setNote("");
      setBankAcct("");
    },
    onError: (e: Error) => {
      toast.error(e.message || "পেমেন্ট সংরক্ষণ করা যায়নি");
    },
  });

  const quickNotes = ["বেতন পরিশোধ", "বকেয়া পরিশোধ", "অগ্রিম", "শুটিং হাজিরা"];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger !== undefined ? (
        trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null
      ) : isControlled ? null : (
        <DialogTrigger asChild>
          <button
            type="button"
            className="group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-4 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary transition-transform group-hover:scale-105">
                <Wallet className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-foreground">দ্রুত বকেয়া পরিশোধ</span>
                  <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    পেমেন্ট
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {dueMembersList.length > 0
                    ? `${toBn(dueMembersList.length)} জন সদস্যের বকেয়া আছে`
                    : "সকল সদস্যের বকেয়া পরিশোধিত"}
                </div>
              </div>
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" />
            </span>
          </button>
        </DialogTrigger>
      )}

      <DialogContent
        className="flex flex-col max-h-[92vh] sm:max-h-[90vh] w-full max-w-[calc(100vw-1.5rem)] sm:max-w-lg md:max-w-xl p-0 rounded-2xl sm:rounded-3xl overflow-hidden gap-0 border-border/80 shadow-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 bg-muted/20 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <span className="grid h-9 w-9 sm:h-10 sm:w-10 shrink-0 place-items-center rounded-xl sm:rounded-2xl bg-primary/10 text-primary">
              <Wallet className="h-4 w-4 sm:h-5 sm:w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-sm sm:text-base font-bold truncate">দ্রুত বকেয়া পরিশোধ</DialogTitle>
              <p className="text-[11px] sm:text-xs text-muted-foreground truncate">সদস্য নির্বাচন করে তাৎক্ষণিক পেমেন্ট দিন</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 space-y-4">
          {/* Quick Due Members Chips */}
          {dueMembersList.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1 truncate">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" /> বকেয়া সদস্যগণ ({toBn(dueMembersList.length)} জন)
                </span>
                <span className="text-[10px] sm:text-xs font-normal text-muted-foreground/80 shrink-0">ক্লিক করে বাছুন</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                {dueMembersList.slice(0, 10).map((m) => {
                  const bal = dueMap.get(m.id) ?? 0;
                  const isSelected = memberId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectMember(m.id)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition active:scale-95 ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground font-semibold shadow-xs"
                          : "border-border/70 bg-card hover:bg-accent/60 text-foreground"
                      }`}
                    >
                      <MemberAvatar name={m.name} photoUrl={m.photo_url} size="sm" />
                      <span className="truncate max-w-[85px] sm:max-w-[110px] font-medium">{m.name}</span>
                      <span
                        className={`font-mono text-[10px] sm:text-[11px] font-bold ${
                          isSelected ? "text-primary-foreground" : "text-destructive"
                        }`}
                      >
                        {taka(bal)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Member Selection */}
          <div className="space-y-1.5">
            <Label className="text-xs sm:text-sm font-semibold">সদস্য নির্বাচন</Label>
            <Select value={memberId} onValueChange={handleSelectMember}>
              <SelectTrigger className="h-10 sm:h-11 rounded-xl text-xs sm:text-sm">
                <SelectValue placeholder="সদস্য নির্বাচন করুন…" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {sortedMembers.map((m) => {
                  const due = dueMap.get(m.id) ?? 0;
                  return (
                    <SelectItem key={m.id} value={m.id} className="py-2">
                      <div className="flex items-center justify-between gap-3 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          <MemberAvatar name={m.name} photoUrl={m.photo_url} size="sm" />
                          <span className="truncate font-medium text-xs sm:text-sm">{m.name}</span>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] sm:text-xs font-bold ${
                            due > 0
                              ? "bg-destructive/10 text-destructive"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {due > 0 ? taka(due) : "পেইড"}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Selected Member Info Card */}
          {selectedMember && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 sm:p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <MemberAvatar
                    name={selectedMember.name}
                    photoUrl={selectedMember.photo_url}
                    size="md"
                  />
                  <div className="min-w-0">
                    <div className="font-bold text-sm sm:text-base leading-tight truncate">{selectedMember.name}</div>
                    <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                      {selectedMember.phone ? toBn(selectedMember.phone) : "ফোন নম্বর নেই"}
                    </div>
                  </div>
                </div>

                <div className="flex sm:flex-col items-baseline sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-primary/10">
                  <div className="text-[10px] sm:text-[11px] text-muted-foreground uppercase font-bold tracking-wider">
                    {targetChannelId ? "নির্বাচিত খাতের বকেয়া" : "মোট বকেয়া"}
                  </div>
                  <div
                    className={`font-roboto font-black text-lg sm:text-2xl ${
                      (targetChannelId ? selectedAccountDue : totalDue) > 0
                        ? "text-destructive"
                        : "text-emerald-600"
                    }`}
                  >
                    {taka(targetChannelId ? selectedAccountDue : totalDue)}
                  </div>

                  {/* Show share channel due prominently */}
                  {memberSharedTotal > 0 && (
                    <div className="mt-1 flex flex-wrap justify-end gap-1">
                      <span className="rounded-md bg-purple-500/15 border border-purple-500/35 px-1.5 py-0.5 text-[10px] sm:text-[11px] font-bold text-purple-700 dark:text-purple-300">
                        শেয়ার চ্যানেল: {taka(memberSharedTotal)}
                      </span>
                      {memberMainDue > 0 && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[9.5px] sm:text-[10px] font-medium text-muted-foreground">
                          মূল: {taka(memberMainDue)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {lastPayment && (
                <div className="flex flex-wrap items-center justify-between gap-1 rounded-xl bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">
                  <span className="text-[11px] sm:text-xs">সর্বশেষ পেমেন্ট:</span>
                  <span className="font-semibold text-foreground text-[11px] sm:text-xs">
                    {taka(lastPayment.amount)} · {bnDate(lastPayment.paid_at.slice(0, 10))}
                  </span>
                </div>
              )}

              {/* Destination Selector: Main Account vs Shared Channels */}
              <div className="pt-2 border-t border-primary/15 space-y-2">
                <div className="text-xs font-bold text-muted-foreground">পেমেন্টের খাত / অ্যাকাউন্ট</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTargetChannelId(null);
                      if (memberMainDue > 0) setAmount(String(Math.round(memberMainDue)));
                      setNote("বেতন/হাজিরা পরিশোধ");
                    }}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm font-bold transition active:scale-98 ${
                      targetChannelId === null
                        ? "border-primary bg-primary text-primary-foreground shadow-xs"
                        : "border-border bg-card hover:bg-muted text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Wallet className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">মূল অ্যাকাউন্ট</span>
                    </div>
                    <span className="shrink-0 font-mono font-bold text-xs">
                      {taka(memberMainDue)}
                    </span>
                  </button>

                  {memberSharedBalances.map((ch) => {
                    const active = targetChannelId === ch.channel_id;
                    return (
                      <button
                        key={ch.channel_id}
                        type="button"
                        onClick={() => {
                          setTargetChannelId(ch.channel_id);
                          if (ch.balance > 0) setAmount(String(Math.round(ch.balance)));
                          setNote(`${ch.channel_name} — হাজিরা পরিশোধ`);
                        }}
                        className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs sm:text-sm font-bold transition active:scale-98 ${
                          active
                            ? "border-purple-600 bg-purple-600 text-white shadow-xs"
                            : "border-purple-300 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/30 text-purple-900 dark:text-purple-200 hover:bg-purple-100/50"
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <Handshake className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{ch.channel_name}</span>
                        </div>
                        <span className="shrink-0 font-mono font-bold text-xs">
                          {taka(ch.balance)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Saved Accounts (if any) */}
          {accounts.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm font-semibold text-muted-foreground">
                সংরক্ষিত অ্যাকাউন্ট (ক্লিক করে অটো-ফিল করুন)
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {accounts.map((a) => {
                  const isMatching = method === a.kind && bankAcct === a.account_number;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setMethod(a.kind as PayMethod);
                        setBankAcct(a.account_number);
                      }}
                      className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition active:scale-98 ${
                        isMatching
                          ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                          : "border-border/60 bg-muted/30 hover:bg-muted/60"
                      }`}
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-background text-primary shadow-xs">
                        {a.kind === "bank" ? (
                          <Landmark className="h-4 w-4" />
                        ) : (
                          <Smartphone className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1 text-xs sm:text-sm">
                        <div className="font-semibold leading-tight truncate">
                          {ACCOUNT_KIND_LABEL[a.kind]}
                          {a.bank_name ? ` · ${a.bank_name}` : ""}
                        </div>
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center rounded-md px-1.5 py-0.5 font-roboto text-xs font-bold tracking-wider ${
                              a.kind === "bank"
                                ? "bg-amber-500/15 text-amber-900 dark:text-amber-200 border border-amber-500/35"
                                : "bg-primary/15 text-primary border border-primary/30"
                            }`}
                          >
                            {a.account_number}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Amount Field with Shortcuts */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <Label className="text-xs sm:text-sm font-semibold">টাকার পরিমাণ (৳)</Label>
              {(targetChannelId ? selectedAccountDue : totalDue) > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      const due = targetChannelId ? selectedAccountDue : totalDue;
                      setAmount(String(Math.round(due)));
                    }}
                    className="rounded-lg bg-primary/10 hover:bg-primary/20 text-primary px-2.5 py-1 text-xs font-bold transition active:scale-95"
                  >
                    সম্পূর্ণ বকেয়া ({taka(targetChannelId ? selectedAccountDue : totalDue)})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const due = targetChannelId ? selectedAccountDue : totalDue;
                      setAmount(String(Math.round(due / 2)));
                    }}
                    className="rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground px-2.5 py-1 text-xs font-semibold transition active:scale-95"
                  >
                    ৫০%
                  </button>
                </div>
              )}
            </div>
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="যেমন: ৫০০০"
              className="h-11 sm:h-12 rounded-xl text-base sm:text-lg font-bold font-mono tracking-wide"
            />
          </div>

          {/* Date & Payment Method */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm font-semibold">পেমেন্টের তারিখ</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 rounded-xl text-xs sm:text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs sm:text-sm font-semibold">পেমেন্ট মাধ্যম</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PayMethod)}>
                <SelectTrigger className="h-11 rounded-xl text-xs sm:text-sm font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
                    <SelectItem key={m} value={m} className="text-xs sm:text-sm">
                      {METHOD_LABEL[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Mobile / Account Number (for non-cash) */}
          {method !== "cash" && (
            <div className="space-y-1.5 animate-in fade-in duration-200">
              <Label className="text-xs sm:text-sm font-semibold">
                {method === "bank" ? "ব্যাংক অ্যাকাউন্ট নম্বর" : `${METHOD_LABEL[method]} নম্বর`}
              </Label>
              <Input
                type="tel"
                value={bankAcct}
                onChange={(e) => setBankAcct(e.target.value)}
                placeholder={method === "bank" ? "অ্যাকাউন্ট নম্বর" : "01XXXXXXXXX"}
                className="h-11 rounded-xl font-mono text-xs sm:text-sm"
              />
            </div>
          )}

          {/* Note & Quick Note Chips */}
          <div className="space-y-1.5">
            <Label className="text-xs sm:text-sm font-semibold">নোট / মন্তব্য (ঐচ্ছিক)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="যেমন: চলতি মাসের বেতন, বিশেষ বোনাস"
              className="h-11 rounded-xl text-xs sm:text-sm"
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {quickNotes.map((qn) => (
                <button
                  key={qn}
                  type="button"
                  onClick={() => setNote(qn)}
                  className="rounded-lg bg-muted/70 hover:bg-muted text-muted-foreground hover:text-foreground px-2.5 py-1 text-xs font-medium transition active:scale-95"
                >
                  {qn}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border/60 bg-muted/20 px-4 py-3 sm:px-6 sm:py-3.5 flex flex-row items-center gap-2 sm:gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
            onClick={() => setOpen(false)}
          >
            বাতিল
          </Button>
          <Button
            type="button"
            className="h-11 flex-[2] rounded-xl text-xs sm:text-sm font-bold gap-2 shadow-md transition active:scale-98 cursor-pointer"
            disabled={savePayment.isPending || !memberId || !amount}
            onClick={() => savePayment.mutate()}
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span className="truncate">{savePayment.isPending ? "সংরক্ষণ হচ্ছে…" : "পেমেন্ট সম্পন্ন করুন"}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
