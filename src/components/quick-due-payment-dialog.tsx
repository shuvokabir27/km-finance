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

  // Calculate or use member balances
  const balancesQuery = useQuery({
    queryKey: ["balances", members.map((m) => m.id).join(",")],
    enabled: open && !membersWithDue && members.length > 0,
    queryFn: async () => {
      const out: Record<string, number> = {};
      await Promise.all(
        members.map(async (m) => {
          const { data } = await supabase.rpc("member_balance", { _member_id: m.id });
          out[m.id] = Number(data ?? 0);
        }),
      );
      return out;
    },
  });

  // Map memberId -> due balance
  const dueMap = useMemo(() => {
    const map = new Map<string, number>();
    if (membersWithDue) {
      for (const m of membersWithDue) {
        map.set(m.id, m.total);
      }
    } else if (balancesQuery.data) {
      for (const [id, bal] of Object.entries(balancesQuery.data)) {
        map.set(id, bal);
      }
    }
    return map;
  }, [membersWithDue, balancesQuery.data]);

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

  const currentDue = memberId ? (dueMap.get(memberId) ?? 0) : 0;

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
    const due = dueMap.get(id) ?? 0;
    if (due > 0) {
      setAmount(String(Math.round(due)));
    } else {
      setAmount("");
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
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["dues-breakdown"] });
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
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
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
        className="max-h-[92vh] max-w-md overflow-hidden p-0 rounded-3xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className="border-b border-border/60 bg-muted/20 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Wallet className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-base font-bold">দ্রুত বকেয়া পরিশোধ</DialogTitle>
              <p className="text-[11px] text-muted-foreground">সদস্য নির্বাচন করে তাৎক্ষণিক পেমেন্ট দিন</p>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[75vh] overflow-y-auto px-5 py-4 space-y-4">
          {/* Quick Due Members Chips */}
          {dueMembersList.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" /> বকেয়া সদস্যগণ ({toBn(dueMembersList.length)} জন)
                </span>
                <span className="text-[10px] font-normal">ক্লিক করে বাছুন</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {dueMembersList.slice(0, 8).map((m) => {
                  const bal = dueMap.get(m.id) ?? 0;
                  const isSelected = memberId === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectMember(m.id)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground font-semibold shadow-sm"
                          : "border-border/70 bg-card hover:bg-accent/60 text-foreground"
                      }`}
                    >
                      <MemberAvatar name={m.name} photoUrl={m.photo_url} size="sm" />
                      <span className="truncate max-w-[90px]">{m.name}</span>
                      <span
                        className={`font-mono text-[10px] font-bold ${
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
            <Label className="text-xs font-semibold">সদস্য নির্বাচন</Label>
            <Select value={memberId} onValueChange={handleSelectMember}>
              <SelectTrigger className="h-11 rounded-xl">
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
                          <span className="truncate font-medium">{m.name}</span>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
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
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <MemberAvatar
                    name={selectedMember.name}
                    photoUrl={selectedMember.photo_url}
                    size="md"
                  />
                  <div>
                    <div className="font-bold text-sm leading-tight">{selectedMember.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {selectedMember.phone ? toBn(selectedMember.phone) : "ফোন নম্বর নেই"}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground uppercase font-medium">বর্তমান বকেয়া</div>
                  <div
                    className={`text-base font-black ${
                      currentDue > 0 ? "text-destructive" : "text-emerald-600"
                    }`}
                  >
                    {taka(currentDue)}
                  </div>
                </div>
              </div>

              {lastPayment && (
                <div className="flex items-center justify-between rounded-xl bg-background/80 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                  <span>সর্বশেষ পেমেন্ট:</span>
                  <span className="font-semibold text-foreground">
                    {taka(lastPayment.amount)} · {bnDate(lastPayment.paid_at.slice(0, 10))}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Saved Accounts (if any) */}
          {accounts.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground">
                সংরক্ষিত অ্যাকাউন্ট (ক্লিক করে অটো-ফিল করুন)
              </Label>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
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
                      className={`flex items-center gap-2 rounded-xl border p-2 text-left transition ${
                        isMatching
                          ? "border-primary bg-primary/10 shadow-sm"
                          : "border-border/60 bg-muted/30 hover:bg-muted/60"
                      }`}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-background text-primary">
                        {a.kind === "bank" ? (
                          <Landmark className="h-3.5 w-3.5" />
                        ) : (
                          <Smartphone className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="font-semibold leading-tight">
                          {ACCOUNT_KIND_LABEL[a.kind]}
                          {a.bank_name ? ` · ${a.bank_name}` : ""}
                        </div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                          {a.account_number}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Amount Field with Shortcuts */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">টাকার পরিমাণ (৳)</Label>
              {currentDue > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAmount(String(Math.round(currentDue)))}
                    className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary hover:bg-primary/20"
                  >
                    সম্পূর্ণ বকেয়া
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmount(String(Math.round(currentDue / 2)))}
                    className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted/80"
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
              className="h-11 rounded-xl text-base font-bold"
            />
          </div>

          {/* Date & Payment Method */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">পেমেন্টের তারিখ</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">পেমেন্ট মাধ্যম</Label>
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
          </div>

          {/* Mobile / Account Number (for non-cash) */}
          {method !== "cash" && (
            <div className="space-y-1.5 animate-in fade-in duration-200">
              <Label className="text-xs font-semibold">
                {method === "bank" ? "ব্যাংক অ্যাকাউন্ট নম্বর" : `${METHOD_LABEL[method]} নম্বর`}
              </Label>
              <Input
                type="tel"
                value={bankAcct}
                onChange={(e) => setBankAcct(e.target.value)}
                placeholder={method === "bank" ? "অ্যাকাউন্ট নম্বর" : "01XXXXXXXXX"}
                className="h-11 rounded-xl font-mono text-sm"
              />
            </div>
          )}

          {/* Note & Quick Note Chips */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">নোট / মন্তব্য (ঐচ্ছিক)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="যেমন: চলতি মাসের বেতন, বিশেষ বোনাস"
              className="h-11 rounded-xl text-xs"
            />
            <div className="flex flex-wrap gap-1 pt-1">
              {quickNotes.map((qn) => (
                <button
                  key={qn}
                  type="button"
                  onClick={() => setNote(qn)}
                  className="rounded-full bg-muted/60 px-2 py-0.5 text-[10.5px] text-muted-foreground hover:bg-muted"
                >
                  {qn}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 bg-muted/10 px-5 py-3 flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-xl"
            onClick={() => setOpen(false)}
          >
            বাতিল
          </Button>
          <Button
            className="flex-1 rounded-xl gap-1.5 font-bold shadow-md"
            disabled={savePayment.isPending || !memberId || !amount}
            onClick={() => savePayment.mutate()}
          >
            <CheckCircle2 className="h-4 w-4" />
            {savePayment.isPending ? "সংরক্ষণ হচ্ছে…" : "পেমেন্ট সম্পন্ন করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
