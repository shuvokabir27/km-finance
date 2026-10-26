import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Gift, Plus, Trash2 } from "lucide-react";
import { taka, bnDate } from "@/lib/format";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";

type Bonus = { id: string; amount: number; note: string | null; given_at: string };

export function BonusSection({ memberId }: { memberId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const { data: bonuses = [] } = useQuery({
    queryKey: ["bonuses", memberId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bonuses")
        .select("id, amount, note, given_at")
        .eq("member_id", memberId)
        .order("given_at", { ascending: false });
      if (error) throw error;
      return data as Bonus[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["bonuses", memberId] });
    qc.invalidateQueries({ queryKey: ["balances"] });
    qc.invalidateQueries({ queryKey: ["balance", memberId] });
    qc.invalidateQueries({ queryKey: ["member-monthly-history"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("সঠিক পরিমাণ দিন");
      const { error } = await supabase.from("bonuses").insert({
        owner_id: u.user.id,
        member_id: memberId,
        amount: amt,
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setAmount(""); setNote("");
      toast.success("বোনাস যোগ হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bonuses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("বোনাস মুছে ফেলা হয়েছে");
    },
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1 text-xs font-medium text-warning-foreground hover:bg-warning/20"
      >
        <Gift className="h-3.5 w-3.5" /> {open ? "বোনাস লুকান" : "বোনাস দিন"}
      </button>

      {open && (
        <div className="mt-2 space-y-2 rounded-xl border bg-muted/30 p-3">
          <div className="grid grid-cols-[1fr_2fr_auto] gap-2">
            <Input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              placeholder="পরিমাণ"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
            <Input
              placeholder="বিবরণ (ঐচ্ছিক)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {bonuses.length === 0 && (
            <div className="py-1 text-center text-xs text-muted-foreground">কোনো বোনাস নেই</div>
          )}

          <ul className="space-y-1">
            {bonuses.map((b) => (
              <li key={b.id} className="flex items-center justify-between rounded-lg bg-card px-2.5 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-success">{taka(b.amount)}</div>
                  <div className="truncate text-[10.5px] text-muted-foreground">
                    {bnDate(b.given_at)}{b.note ? ` • ${b.note}` : ""}
                  </div>
                </div>
                <ConfirmDelete
                  trigger={
                    <button
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="মুছুন"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  }
                  title="বোনাস ডিলিট করবেন?"
                  description={`${taka(b.amount)} বোনাসটি স্থায়ীভাবে মুছে ফেলা হবে।`}
                  relatedItems={["সদস্যের মোট ব্যালেন্স থেকে এই পরিমাণ কমে যাবে"]}
                  onConfirm={() => remove.mutate(b.id)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
