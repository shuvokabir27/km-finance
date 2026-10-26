import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Landmark, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { toBn } from "@/lib/format";
import { BD_BANKS, ACCOUNT_KIND_LABEL, type AccountKind } from "@/lib/bd-banks";
import { ConfirmDelete } from "@/components/confirm-delete";

type Account = {
  id: string;
  member_id: string;
  kind: AccountKind;
  bank_name: string | null;
  branch: string | null;
  account_holder: string | null;
  account_number: string;
  note: string | null;
};

export function MemberAccounts({ memberId, memberName }: { memberId: string; memberName: string }) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<AccountKind>("bkash");
  const [bankName, setBankName] = useState("");
  const [branch, setBranch] = useState("");
  const [holder, setHolder] = useState(memberName);
  const [number, setNumber] = useState("");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["member_accounts", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_accounts")
        .select("*")
        .eq("member_id", memberId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Account[];
    },
  });

  const reset = () => {
    setAdding(false);
    setKind("bkash");
    setBankName("");
    setBranch("");
    setHolder(memberName);
    setNumber("");
  };

  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      if (!number.trim()) throw new Error("একাউন্ট নম্বর দিন");
      if (kind === "bank" && !bankName.trim()) throw new Error("ব্যাংক নির্বাচন করুন");
      const { error } = await supabase.from("member_accounts").insert({
        owner_id: u.user.id,
        member_id: memberId,
        kind,
        bank_name: kind === "bank" ? bankName : null,
        branch: kind === "bank" ? branch.trim() || null : null,
        account_holder: holder.trim() || null,
        account_number: number.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["member_accounts", memberId] });
      toast.success("একাউন্ট যোগ হয়েছে");
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("member_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["member_accounts", memberId] });
      toast.success("একাউন্ট মুছে ফেলা হয়েছে");
    },
  });

  return (
    <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">পেমেন্ট একাউন্ট</div>
        {!adding && (
          <Button type="button" size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" /> যোগ
          </Button>
        )}
      </div>

      {isLoading && <div className="py-2 text-xs text-muted-foreground">লোড হচ্ছে…</div>}

      {!isLoading && accounts.length === 0 && !adding && (
        <div className="py-2 text-xs text-muted-foreground">এখনও কোনো একাউন্ট যোগ করা হয়নি</div>
      )}

      <ul className="space-y-1.5">
        {accounts.map((a) => (
          <li key={a.id} className="flex items-start gap-2 rounded-lg border bg-card p-2">
            <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              {a.kind === "bank" ? <Landmark className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1 text-xs">
              <div className="font-medium">
                {ACCOUNT_KIND_LABEL[a.kind]}
                {a.kind === "bank" && a.bank_name ? ` — ${a.bank_name}` : ""}
              </div>
              <div className="font-mono text-sm">{toBn(a.account_number)}</div>
              {(a.account_holder || a.branch) && (
                <div className="text-muted-foreground">
                  {a.account_holder}{a.account_holder && a.branch ? " • " : ""}{a.branch}
                </div>
              )}
            </div>
            <ConfirmDelete
              trigger={
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label="মুছুন"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              }
              title="অ্যাকাউন্ট ডিলিট করবেন?"
              description="এই অ্যাকাউন্টের তথ্য স্থায়ীভাবে মুছে ফেলা হবে।"
              onConfirm={() => remove.mutate(a.id)}
            />
          </li>
        ))}
      </ul>

      {adding && (
        <div className="space-y-2 rounded-lg border bg-card p-3">
          <div className="space-y-1.5">
            <Label className="text-xs">ধরন</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AccountKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bkash">বিকাশ</SelectItem>
                <SelectItem value="nagad">নগদ</SelectItem>
                <SelectItem value="rocket">রকেট</SelectItem>
                <SelectItem value="upay">উপায়</SelectItem>
                <SelectItem value="bank">ব্যাংক একাউন্ট</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === "bank" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">ব্যাংক *</Label>
                <Select value={bankName} onValueChange={setBankName}>
                  <SelectTrigger><SelectValue placeholder="ব্যাংক নির্বাচন করুন" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {BD_BANKS.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">শাখা</Label>
                <Input value={branch} onChange={(e) => setBranch(e.target.value)} />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">একাউন্ট হোল্ডার</Label>
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{kind === "bank" ? "একাউন্ট নম্বর *" : "নম্বর *"}</Label>
            <Input
              type="tel"
              value={number}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, "");
                setNumber(kind === "bank" ? digits : digits.slice(0, 11));
              }}
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={kind === "bank" ? undefined : 11}
              placeholder={kind === "bank" ? "একাউন্ট নম্বর" : "01XXXXXXXXX"}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="button" size="sm" variant="ghost" onClick={reset} className="flex-1">বাতিল</Button>
            <Button type="button" size="sm" onClick={() => add.mutate()} disabled={add.isPending} className="flex-1">
              সংরক্ষণ
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
