import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tv,
  ChevronRight,
  Plus,
  ArrowLeft,
  Calendar,
  Trash2,
  BadgeDollarSign,
  Wallet,
  Receipt,
  CircleAlert,
} from "lucide-react";
import { taka, toBn, bnDate } from "@/lib/format";
import { BrandAvatar, useChannels } from "@/lib/brand";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";

export const Route = createFileRoute("/_authenticated/client-dues")({
  component: ClientDuesPage,
});

type Summary = {
  channel: string;
  shooting_count: number;
  contract_total: number;
  received_total: number;
  due_total: number;
};

function ClientDuesPage() {
  const [selected, setSelected] = useState<string | null>(null);

  const { data: summary = [], isLoading } = useQuery({
    queryKey: ["client-channel-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_channel_summary");
      if (error) throw error;
      return ((data ?? []) as Summary[]).map((r) => ({
        channel: r.channel,
        shooting_count: Number(r.shooting_count),
        contract_total: Number(r.contract_total),
        received_total: Number(r.received_total),
        due_total: Number(r.due_total),
      }));
    },
  });

  const totals = useMemo(() => {
    return summary.reduce(
      (acc, s) => ({
        contract: acc.contract + s.contract_total,
        received: acc.received + s.received_total,
        due: acc.due + s.due_total,
      }),
      { contract: 0, received: 0, due: 0 },
    );
  }, [summary]);

  if (selected) {
    return <ChannelDetail channel={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ক্লায়েন্ট হিসাব</h1>
        <p className="text-sm text-muted-foreground">বাহিরের চ্যানেলের পাওনা ও প্রাপ্তি</p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="মোট পাওনা"
          value={taka(totals.contract)}
          Icon={Receipt}
          tone="neutral"
        />
        <StatCard
          label="প্রাপ্ত"
          value={taka(totals.received)}
          Icon={Wallet}
          tone="ok"
        />
        <StatCard
          label="বকেয়া"
          value={taka(totals.due)}
          Icon={CircleAlert}
          tone={totals.due > 0 ? "warn" : "ok"}
        />
      </div>

      {isLoading && (
        <div className="py-10 text-center text-muted-foreground">লোড হচ্ছে…</div>
      )}

      {!isLoading && summary.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <Tv className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">এখনও কোনো বাহিরের চ্যানেল নেই</p>
          <p className="mt-1 text-xs text-muted-foreground">
            ডিরেক্টরি পেজে গিয়ে চ্যানেলকে "নিজের চ্যানেল" নয় হিসেবে চিহ্নিত করুন
          </p>
        </div>
      )}

      <div className="space-y-2">
        {summary.map((s) => (
          <ChannelRow key={s.channel} data={s} onClick={() => setSelected(s.channel)} />
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: "neutral" | "ok" | "warn";
}) {
  const toneCls =
    tone === "warn"
      ? "bg-destructive/10 text-destructive"
      : tone === "ok"
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : "bg-primary/10 text-primary";
  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className={`mb-1 inline-flex h-7 w-7 items-center justify-center rounded-full ${toneCls}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  );
}

function ChannelRow({ data, onClick }: { data: Summary; onClick: () => void }) {
  const { data: channels = [] } = useChannels();
  const ch = channels.find((c) => c.name === data.channel);
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition hover:bg-accent/40 active:scale-[0.99]"
    >
      <BrandAvatar kind="channel" name={data.channel} src={ch?.logo_url} size={44} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{data.channel}</div>
        <div className="text-[11px] text-muted-foreground">
          {toBn(data.shooting_count)} টি শুটিং • পাওনা {taka(data.contract_total)}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px]">
          <span className="text-emerald-600 dark:text-emerald-400">
            প্রাপ্ত {taka(data.received_total)}
          </span>
          <span
            className={
              data.due_total > 0
                ? "font-semibold text-destructive"
                : "text-muted-foreground"
            }
          >
            বকেয়া {taka(data.due_total)}
          </span>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </button>
  );
}

type ChannelShooting = {
  id: string;
  name: string;
  shoot_date: string;
  contract_amount: number | null;
};

type ChannelPayment = {
  id: string;
  shooting_id: string | null;
  amount: number;
  received_at: string;
  method: string | null;
  note: string | null;
};

function ChannelDetail({ channel, onBack }: { channel: string; onBack: () => void }) {
  const qc = useQueryClient();
  const { data: channels = [] } = useChannels();
  const ch = channels.find((c) => c.name === channel);

  const { data: shootings = [] } = useQuery({
    queryKey: ["client-shootings", channel],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date, contract_amount")
        .eq("channel", channel)
        .order("shoot_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChannelShooting[];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["client-payments", channel],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_payments")
        .select("id, shooting_id, amount, received_at, method, note")
        .eq("channel", channel)
        .order("received_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ChannelPayment[];
    },
  });

  // FIFO auto-allocation: total received (all payments, linked or not) is
  // applied to shootings in shoot_date ascending order — oldest dues first.
  const paidByShooting = useMemo(() => {
    const totalReceived = payments.reduce((s, p) => s + Number(p.amount), 0);
    const ordered = [...shootings].sort((a, b) =>
      a.shoot_date.localeCompare(b.shoot_date),
    );
    const m = new Map<string, number>();
    let pool = totalReceived;
    for (const s of ordered) {
      const contract = Number(s.contract_amount ?? 0);
      if (contract <= 0) {
        m.set(s.id, 0);
        continue;
      }
      const apply = Math.min(pool, contract);
      m.set(s.id, apply);
      pool -= apply;
      if (pool <= 0) pool = 0;
    }
    return m;
  }, [payments, shootings]);

  const unallocated = useMemo(() => {
    const totalReceived = payments.reduce((s, p) => s + Number(p.amount), 0);
    const contractSum = shootings.reduce(
      (s, x) => s + Number(x.contract_amount ?? 0),
      0,
    );
    return Math.max(0, totalReceived - contractSum);
  }, [payments, shootings]);


  const contractTotal = shootings.reduce(
    (s, x) => s + Number(x.contract_amount ?? 0),
    0,
  );
  const receivedTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const dueTotal = contractTotal - receivedTotal;

  const removePayment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_payments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-payments", channel] });
      qc.invalidateQueries({ queryKey: ["client-channel-summary"] });
      toast.success("পেমেন্ট মুছে ফেলা হয়েছে");
    },
  });

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> ফিরে যান
      </button>

      <div className="flex items-center gap-3 rounded-2xl border bg-card p-4">
        <BrandAvatar kind="channel" name={channel} src={ch?.logo_url} size={56} />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-muted-foreground">ক্লায়েন্ট চ্যানেল</div>
          <div className="truncate text-lg font-bold">{channel}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="মোট পাওনা" value={taka(contractTotal)} Icon={Receipt} tone="neutral" />
        <StatCard label="প্রাপ্ত" value={taka(receivedTotal)} Icon={Wallet} tone="ok" />
        <StatCard
          label="বকেয়া"
          value={taka(dueTotal)}
          Icon={CircleAlert}
          tone={dueTotal > 0 ? "warn" : "ok"}
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold">শুটিং তালিকা</h2>
        <AddPaymentDialog
          channel={channel}
          shootings={shootings}
          trigger={
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> পেমেন্ট যোগ
            </Button>
          }
        />
      </div>

      {shootings.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
          এই চ্যানেলের কোনো শুটিং যোগ হয়নি
        </div>
      )}

      <div className="space-y-2">
        {shootings.map((s) => {
          const paid = paidByShooting.get(s.id) ?? 0;
          const contract = Number(s.contract_amount ?? 0);
          const due = contract - paid;
          const status =
            contract === 0
              ? "মূল্য নেই"
              : due <= 0
                ? "পরিশোধিত"
                : paid > 0
                  ? "আংশিক"
                  : "বকেয়া";
          const statusCls =
            status === "পরিশোধিত"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
              : status === "আংশিক"
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : status === "বকেয়া"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-muted text-muted-foreground";
          return (
            <div key={s.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{s.name}</div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" /> {bnDate(s.shoot_date)}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusCls}`}>
                  {status}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <MiniStat label="চুক্তি" value={taka(contract)} />
                <MiniStat label="প্রাপ্ত" value={taka(paid)} tone="ok" />
                <MiniStat label="বকেয়া" value={taka(due)} tone={due > 0 ? "warn" : "muted"} />
              </div>
              <div className="mt-2 flex justify-end">
                <AddPaymentDialog
                  channel={channel}
                  shootings={shootings}
                  defaultShootingId={s.id}
                  trigger={
                    <Button variant="outline" size="sm">
                      <BadgeDollarSign className="mr-1 h-3.5 w-3.5" /> পেমেন্ট নিন
                    </Button>
                  }
                />
              </div>
            </div>
          );
        })}
      </div>

      {payments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">পেমেন্ট ইতিহাস</h2>
            <span className="text-xs text-muted-foreground">
              মোট {toBn(payments.length)} টি
            </span>
          </div>
          <div className="rounded-2xl border bg-card">
            <ul className="divide-y">
              {payments.map((p) => {
                const linked = p.shooting_id
                  ? shootings.find((s) => s.id === p.shooting_id)
                  : null;
                return (
                  <li key={p.id} className="flex items-start gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                          {taka(Number(p.amount))}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          • {bnDate(p.received_at)}
                        </span>
                        {p.method && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            {p.method}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {linked ? `শুটিং: ${linked.name}` : "স্বয়ংক্রিয় বণ্টন (পুরাতন বকেয়া থেকে)"}
                        {p.note ? ` • ${p.note}` : ""}
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
                      title="পেমেন্ট মুছবেন?"
                      description={`${taka(Number(p.amount))} পেমেন্টটি মুছে ফেলা হবে।`}
                      onConfirm={() => removePayment.mutate(p.id)}
                    />
                  </li>
                );
              })}
            </ul>
          </div>
          {unallocated > 0 && (
            <p className="text-[11px] text-muted-foreground">
              এর মধ্যে {taka(unallocated)} অতিরিক্ত (মোট চুক্তির চেয়ে বেশি প্রাপ্ত) — অগ্রিম হিসেবে থাকল।
            </p>
          )}

        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "muted";
}) {
  const cls =
    tone === "warn"
      ? "text-destructive"
      : tone === "ok"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "muted"
          ? "text-muted-foreground"
          : "";
  return (
    <div className="rounded-xl bg-muted/40 p-2">
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function AddPaymentDialog({
  channel,
  shootings,
  defaultShootingId,
  trigger,
}: {
  channel: string;
  shootings: ChannelShooting[];
  defaultShootingId?: string;
  trigger: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<string>("ক্যাশ");
  const [shootingId, setShootingId] = useState<string>(defaultShootingId ?? "none");
  const [note, setNote] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("সঠিক পরিমাণ দিন");
      const { error } = await supabase.from("client_payments").insert({
        owner_id: u.user.id,
        channel,
        shooting_id: shootingId === "none" ? null : shootingId,
        amount: amt,
        received_at: date,
        method: method || null,
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-payments", channel] });
      qc.invalidateQueries({ queryKey: ["client-channel-summary"] });
      toast.success("পেমেন্ট যোগ হয়েছে");
      setOpen(false);
      setAmount("");
      setNote("");
      setShootingId(defaultShootingId ?? "none");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleOpen = (v: boolean) => {
    if (v) {
      setAmount("");
      setNote("");
      setDate(new Date().toISOString().slice(0, 10));
      setMethod("ক্যাশ");
      setShootingId(defaultShootingId ?? "none");
    }
    setOpen(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>পেমেন্ট গ্রহণ — {channel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>পরিমাণ (৳)</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="যেমন: 10000"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>তারিখ</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>মাধ্যম</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ক্যাশ">ক্যাশ</SelectItem>
                  <SelectItem value="বিকাশ">বিকাশ</SelectItem>
                  <SelectItem value="নগদ">নগদ</SelectItem>
                  <SelectItem value="রকেট">রকেট</SelectItem>
                  <SelectItem value="ব্যাংক">ব্যাংক</SelectItem>
                  <SelectItem value="চেক">চেক</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>কোন শুটিং-এর জন্য?</Label>
            <Select value={shootingId} onValueChange={setShootingId}>
              <SelectTrigger>
                <SelectValue placeholder="বাছুন" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">স্বয়ংক্রিয় — পুরাতন বকেয়া থেকে পরিশোধ</SelectItem>
                {shootings.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} — {bnDate(s.shoot_date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>নোট</Label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ঐচ্ছিক"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="w-full"
          >
            সংরক্ষণ করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
