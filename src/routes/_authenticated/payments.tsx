import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { taka, bnDate, toBn } from "@/lib/format";
import { Wallet, Landmark, Smartphone, Copy, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { MemberAvatar } from "@/components/member-avatar";
import { ACCOUNT_KIND_LABEL, type AccountKind } from "@/lib/bd-banks";
import { saveMemberAccountIfNew } from "@/lib/save-member-account";

export const Route = createFileRoute("/_authenticated/payments")({
  component: PaymentsPage,
});

type Member = { id: string; name: string; type: "daily" | "monthly"; photo_url: string | null };
type PayMethod = "cash" | "bkash" | "nagad" | "rocket" | "upay" | "bank";
type Payment = { id: string; member_id: string; amount: number; note: string | null; paid_at: string; method: PayMethod | null; bank_account_number: string | null; members: { name: string; photo_url: string | null } | null };
type Account = { id: string; kind: AccountKind; bank_name: string | null; branch: string | null; account_holder: string | null; account_number: string };

const METHOD_LABEL: Record<PayMethod, string> = {
  cash: "ক্যাশ",
  bkash: "বিকাশ",
  nagad: "নগদ",
  rocket: "রকেট",
  upay: "উপায়",
  bank: "ব্যাংক",
};

const PAYMENT_SELECT =
  "id, member_id, amount, note, paid_at, method, bank_account_number, members(name, photo_url)";

function PaymentsPage() {
  const qc = useQueryClient();
  const [memberId, setMemberId] = useState<string>("all");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [bankAcct, setBankAcct] = useState("");
  const [showAll, setShowAll] = useState(false);


  const { data: members = [] } = useQuery({
    queryKey: ["members-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("members").select("id, name, type, photo_url").order("name");
      if (error) throw error;
      return data as Member[];
    },
  });

  const balance = useQuery({
    queryKey: ["balance", memberId],
    enabled: !!memberId && memberId !== "all",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("member_balance", { _member_id: memberId });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

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

  // একজন সদস্যেয় শেয় ১০ট, "সব নাম" এ শেয় ৫০ট; "সব দেখুন" চাপলো আর সীম নাই
  const PAGE = memberId === "all" ? 50 : 10;

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
      return data as unknown as Payment[];
    },
  });

  const visiblePayments = payments;
  const hasMore = !showAll && payments.length >= PAGE;

  useEffect(() => { if (!memberId && members[0]) setMemberId(members[0].id); }, [members, memberId]);

  // Auto-fill account number when method matches a saved member account
  useEffect(() => {
    if (method === "cash") { setBankAcct(""); return; }
    const match = accounts.find((a) => a.kind === method);
    setBankAcct(match ? match.account_number : "");
  }, [method, accounts]);


  const pay = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!memberId || memberId === "all" || !amt || amt <= 0) throw new Error("সঠিক তথ্য দিন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const { error } = await supabase.from("payments").insert({
        owner_id: u.user.id,
        member_id: memberId,
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
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("পেমেন্ট সংরক্ষিত");
      setAmount(""); setNote(""); setBankAcct("");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const selectedMember = members.find((m) => m.id === memberId);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">পেমেন্ট</h1>
        <p className="text-sm text-muted-foreground">সদস্যকে বেতন পরিশোধ করুন</p>
      </div>

      <div className="space-y-3 rounded-2xl border bg-card p-4">
        <div className="space-y-1.5">
          <Label>সদস্য নির্বাচন</Label>
          <Select value={memberId} onValueChange={(v) => { setShowAll(false); setMemberId(v); }}>
            <SelectTrigger className="h-12">
              <SelectValue placeholder="সদস্য নির্বাচন করুন" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                <span className="font-semibold">সব নাম</span>
              </SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <div className="flex items-center gap-2">
                    <MemberAvatar name={m.name} photoUrl={m.photo_url} size="sm" />
                    <span>{m.name}</span>
                    <span className="text-xs text-muted-foreground">({m.type === "daily" ? "দৈনিক" : "মাসিক"})</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedMember && (
          <div className="flex items-center gap-3 rounded-xl bg-primary/10 p-3">
            <MemberAvatar name={selectedMember.name} photoUrl={selectedMember.photo_url} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{selectedMember.name}</div>
              <div className="text-xs text-muted-foreground">বর্তমান ব্যালেন্স</div>
              <div className="text-xl font-bold text-primary">
                {balance.isLoading ? "…" : taka(balance.data ?? 0)}
              </div>
            </div>
            <Wallet className="h-7 w-7 shrink-0 text-primary" />
          </div>
        )}

        {selectedMember && accounts.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground">পেমেন্ট একাউন্ট</div>
            <ul className="space-y-1.5">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    {a.kind === "bank" ? <Landmark className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="font-medium">
                      {ACCOUNT_KIND_LABEL[a.kind]}
                      {a.kind === "bank" && a.bank_name ? ` — ${a.bank_name}` : ""}
                    </div>
                    <div className="font-mono text-sm">{a.account_number}</div>
                    {(a.account_holder || a.branch) && (
                      <div className="text-muted-foreground">
                        {a.account_holder}{a.account_holder && a.branch ? " • " : ""}{a.branch}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                    aria-label="কপি"
                    onClick={() => {
                      navigator.clipboard.writeText(a.account_number);
                      toast.success("নম্বর কপি হয়েছে");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>পরিমাণ</Label>
          <Input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" />
        </div>

        <div className="space-y-1.5">
          <Label>পেমেন্ট মাধ্যম</Label>
          <Select value={method} onValueChange={(v) => setMethod(v as PayMethod)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(METHOD_LABEL) as PayMethod[]).map((m) => (
                <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {method !== "cash" && (
          <div className="space-y-1.5">
            <Label>{method === "bank" ? "ব্যাংক অ্যাকাউন্ট নম্বর (ঐচ্ছিক)" : "নম্বর (ঐচ্ছিক)"}</Label>
            <Input
              type="tel"
              inputMode="numeric"
              value={bankAcct}
              onChange={(e) => setBankAcct(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder={method === "bank" ? "অ্যাকাউন্ট নম্বর" : "01XXXXXXXXX"}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>নোট (ঐচ্ছিক)</Label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
        </div>


        <Button className="w-full" onClick={() => pay.mutate()} disabled={pay.isPending || !memberId || memberId === "all" || !amount}>
          পেমেন্ট সংরক্ষণ করুন
        </Button>
      </div>

      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-muted-foreground">
          {memberId === "all"
            ? showAll
              ? "সব পেমেন্ট (সবার)"
              : "সাম্প্রতিক পেমেন্ট (সবার)"
            : `${showAll ? "সব" : "সাম্প্রতিক"} পেমেন্ট — ${selectedMember?.name ?? ""}`}
        </h2>
        {visiblePayments.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            এখনও কোনো পেমেন্ট নেই
          </div>
        ) : (
          <div className="space-y-2">
            {visiblePayments.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
                <MemberAvatar name={p.members?.name ?? "?"} photoUrl={p.members?.photo_url} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-medium">{p.members?.name ?? "সদস্য"}</div>
                    <div className="font-bold text-success">{taka(p.amount)}</div>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {METHOD_LABEL[(p.method ?? "cash") as PayMethod]}
                      {p.bank_account_number ? ` • ${toBn(p.bank_account_number)}` : ""}
                      {p.note ? ` • ${p.note}` : ""}
                    </span>
                    <span>{bnDate(p.paid_at)}</span>
                  </div>

                </div>
              </div>
            ))}
            {hasMore && (
              <Button variant="outline" className="w-full gap-2" onClick={() => setShowAll(true)}>
                <ChevronDown className="h-4 w-4" /> সব পেমেন্ট দেখুন
              </Button>
            )}
            {showAll && payments.length > PAGE && (
              <Button variant="outline" className="w-full gap-2" onClick={() => setShowAll(false)}>
                <ChevronUp className="h-4 w-4" /> কম দেখুন
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
