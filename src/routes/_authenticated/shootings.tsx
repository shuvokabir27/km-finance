import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Clapperboard, Plus, Trash2, Receipt, Calendar, ChevronRight, Pencil, Check, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { taka, toBn, bnDate } from "@/lib/format";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import {
  ChannelField,
  DirectorField,
  ChannelChip,
  DirectorChip,
  ensureChannel,
  ensureDirector,
  useChannels,
} from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/shootings")({
  component: ShootingsPage,
});

type Shooting = {
  id: string;
  name: string;
  shoot_date: string;
  location: string | null;
  note: string | null;
  director: string | null;
  channel: string | null;
  contract_amount: number | null;
};

// Channel/Director hooks, ensureChannel/Director, ChannelField, DirectorField come from @/lib/brand


type Summary = {
  present_count: number;
  attendance_cost: number;
  extra_cost: number;
  total_cost: number;
};

function ShootingsPage() {
  const qc = useQueryClient();
  const [directorFilter, setDirectorFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  const { data: allShootings = [], isLoading } = useQuery({
    queryKey: ["shootings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("*")
        .order("shoot_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Shooting[];
    },
  });

  const directorOptions = useMemo(
    () => [...new Set(allShootings.map((s) => s.director).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "bn")),
    [allShootings],
  );
  const channelOptions = useMemo(
    () => [...new Set(allShootings.map((s) => s.channel).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "bn")),
    [allShootings],
  );

  const shootings = useMemo(
    () =>
      allShootings.filter(
        (s) =>
          (directorFilter === "all" || s.director === directorFilter) &&
          (channelFilter === "all" || s.channel === channelFilter),
      ),
    [allShootings, directorFilter, channelFilter],
  );

  const summaries = useQuery({
    queryKey: ["shooting-summaries", shootings.map((s) => s.id).join(",")],
    enabled: shootings.length > 0,
    queryFn: async () => {
      const out: Record<string, Summary> = {};
      await Promise.all(
        shootings.map(async (s) => {
          const { data, error } = await supabase.rpc("shooting_summary", { _shooting_id: s.id });
          if (error) return;
          const row = (data as Summary[] | null)?.[0];
          if (row) {
            out[s.id] = {
              present_count: Number(row.present_count ?? 0),
              attendance_cost: Number(row.attendance_cost ?? 0),
              extra_cost: Number(row.extra_cost ?? 0),
              total_cost: Number(row.total_cost ?? 0),
            };
          }
        }),
      );
      return out;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shootings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shootings"] });
      qc.invalidateQueries({ queryKey: ["shooting-summaries"] });
      toast.success("শুটিং মুছে ফেলা হয়েছে");
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">শুটিং তালিকা</h1>
          <p className="text-sm text-muted-foreground">{toBn(shootings.length)} টি শুটিং</p>
        </div>
        <AddShootingDialog />
      </div>

      {(directorOptions.length > 0 || channelOptions.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-9 w-auto min-w-[140px] flex-1">
              <SelectValue placeholder="চ্যানেল" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">সব চ্যানেল</SelectItem>
              {channelOptions.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={directorFilter} onValueChange={setDirectorFilter}>
            <SelectTrigger className="h-9 w-auto min-w-[140px] flex-1">
              <SelectValue placeholder="পরিচালক" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">সব পরিচালক</SelectItem>
              {directorOptions.map((d) => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(channelFilter !== "all" || directorFilter !== "all") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setChannelFilter("all"); setDirectorFilter("all"); }}
            >
              <X className="mr-1 h-4 w-4" /> রিসেট
            </Button>
          )}
        </div>
      )}

      {isLoading && <div className="py-10 text-center text-muted-foreground">লোড হচ্ছে…</div>}

      {!isLoading && shootings.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <Clapperboard className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">এখনও কোনো শুটিং যোগ করা হয়নি</p>
          <p className="mt-1 text-xs text-muted-foreground">হাজিরা পেজ থেকেও শুটিং নাম দিয়ে যোগ করা যাবে</p>
        </div>
      )}

      <div className="space-y-3">
        {shootings.map((s) => {
          const sum = summaries.data?.[s.id];
          return (
            <ShootingDetailDialog
              key={s.id}
              shooting={s}
              summary={sum}
              onRemove={() => remove.mutate(s.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

function ShootingDetailDialog({
  shooting: s,
  summary: sum,
  onRemove,
}: {
  shooting: Shooting;
  summary: Summary | undefined;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="w-full rounded-2xl border bg-card p-4 text-left transition hover:bg-accent/40 active:scale-[0.99]"
        >
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl hero-gradient">
              <Clapperboard className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{s.name}</div>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" /> {bnDate(s.shoot_date)}
              </div>
              {s.director && (
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="text-muted-foreground/70 shrink-0">পরিচালক:</span>
                  <DirectorChip name={s.director} size={16} />
                </div>
              )}
              {s.channel && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="text-muted-foreground/70 shrink-0">চ্যানেল:</span>
                  <ChannelChip name={s.channel} size={16} />
                </div>
              )}
              {s.location && <div className="truncate text-xs text-muted-foreground">📍 {s.location}</div>}
            </div>
            <div className="text-right">
              <div className="text-[10.5px] text-muted-foreground">মোট খরচ</div>
              <div className="text-sm font-bold text-primary">{taka(sum?.total_cost ?? 0)}</div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{s.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {bnDate(s.shoot_date)}</span>
            {s.location && <span>• {s.location}</span>}
            {s.director && <span className="inline-flex items-center gap-1">• পরিচালক: <DirectorChip name={s.director} size={16} /></span>}
            {s.channel && <span className="inline-flex items-center gap-1">• চ্যানেল: <ChannelChip name={s.channel} size={16} /></span>}
          </div>
          {s.note && <div className="rounded-xl bg-muted/30 p-2 text-xs">{s.note}</div>}

          <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/30 p-2 text-center">
            <Stat label="হাজির" value={toBn(sum?.present_count ?? 0)} />
            <Stat label="হাজিরা খরচ" value={taka(sum?.attendance_cost ?? 0)} />
            <Stat label="অতিরিক্ত" value={taka(sum?.extra_cost ?? 0)} />
          </div>

          <div className="flex items-center justify-between rounded-xl bg-primary/10 px-3 py-2">
            <span className="text-xs font-medium text-primary">মোট খরচ</span>
            <span className="text-base font-bold text-primary">{taka(sum?.total_cost ?? 0)}</span>
          </div>

          <ExpensesSection shootingId={s.id} />

          <div className="grid grid-cols-2 gap-2">
            <EditShootingDialog
              shooting={s}
              trigger={
                <Button variant="outline" className="w-full">
                  <Pencil className="mr-1.5 h-4 w-4" /> এডিট করুন
                </Button>
              }
            />
            <ConfirmDelete
              trigger={
                <Button
                  variant="outline"
                  className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> শুটিং মুছুন
                </Button>
              }
              title={`"${s.name}" শুটিং ডিলিট করবেন?`}
              description={`"${s.name}" শুটিংটি স্থায়ীভাবে ডিলিট করা হবে।`}
              relatedItems={[
                "এই শুটিংয়ের সকল অতিরিক্ত খরচের রেকর্ড",
                "এই শুটিংয়ের সাথে যুক্ত হাজিরার সংযোগ",
              ]}
              onConfirm={() => {
                onRemove();
                setOpen(false);
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

type Expense = { id: string; amount: number; note: string | null; spent_at: string };

function ExpensesSection({ shootingId }: { shootingId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const { data: expenses = [] } = useQuery({
    queryKey: ["shooting-expenses", shootingId],
    enabled: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shooting_expenses")
        .select("id, amount, note, spent_at")
        .eq("shooting_id", shootingId)
        .order("spent_at", { ascending: false });
      if (error) throw error;
      return data as Expense[];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
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
      qc.invalidateQueries({ queryKey: ["shooting-expenses", shootingId] });
      qc.invalidateQueries({ queryKey: ["shooting-summaries"] });
      setAmount(""); setNote("");
      toast.success("খরচ যোগ হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeExp = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shooting_expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shooting-expenses", shootingId] });
      qc.invalidateQueries({ queryKey: ["shooting-summaries"] });
    },
  });

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10"
      >
        <Receipt className="h-3.5 w-3.5" /> {open ? "খরচ লুকান" : "অতিরিক্ত খরচ"}
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
              placeholder="বিবরণ (যেমন: খাবার, যাতায়াত)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button size="sm" onClick={() => add.mutate()} disabled={add.isPending}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {expenses.length === 0 ? (
            <div className="py-1 text-center text-xs text-muted-foreground">এখনও কোনো খরচ যোগ করা হয়নি</div>
          ) : (
            <>
              <ul className="space-y-1">
                {expenses.map((e, idx) => (
                  <li key={e.id} className="flex items-center gap-2 rounded-lg bg-card px-2.5 py-1.5 text-xs">
                    <span className="w-5 shrink-0 text-center text-[10px] text-muted-foreground">{toBn(idx + 1)}.</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-primary">{taka(e.amount)}</span>
                        <span className="text-[10px] text-muted-foreground">• {bnDate(e.spent_at)}</span>
                      </div>
                      {e.note && <div className="truncate text-muted-foreground">{e.note}</div>}
                    </div>
                    <button
                      onClick={() => removeExp.mutate(e.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="মুছুন"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs">
                <span className="text-muted-foreground">মোট অতিরিক্ত খরচ ({toBn(expenses.length)} টি)</span>
                <span className="font-bold text-primary">
                  {taka(expenses.reduce((s, e) => s + Number(e.amount || 0), 0))}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AddShootingDialog() {
  const qc = useQueryClient();
  const { data: channels = [] } = useChannels();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [director, setDirector] = useState("");
  const [channel, setChannel] = useState("");
  const [contractAmount, setContractAmount] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");

  const selectedChannel = channels.find((c) => c.name === channel.trim());
  const isExternalChannel =
    channel.trim().length > 0 && !selectedChannel?.is_own && !selectedChannel?.is_shared;

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      if (!name.trim()) throw new Error("নাম দিন");
      const chan = await ensureChannel(channel);
      const dir = await ensureDirector(director);
      const { error } = await supabase.from("shootings").insert({
        owner_id: u.user.id,
        name: name.trim(),
        shoot_date: date,
        director: dir,
        channel: chan,
        location: location.trim() || null,
        note: note.trim() || null,
        contract_amount: isExternalChannel && contractAmount ? Number(contractAmount) : null,
      });
      if (error) {
        if (error.code === "23505") throw new Error("একই তারিখে এই নামে শুটিং আছে");
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shootings"] });
      qc.invalidateQueries({ queryKey: ["channels"] });
      qc.invalidateQueries({ queryKey: ["directors"] });
      qc.invalidateQueries({ queryKey: ["client-channel-summary"] });
      toast.success("শুটিং যোগ হয়েছে");
      setOpen(false);
      setName(""); setDirector(""); setChannel(""); setContractAmount(""); setLocation(""); setNote("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1 h-4 w-4" /> যোগ করুন</Button>
      </DialogTrigger>
      <DialogContent className={glassDialogClass}>
        <DialogHeader className="pb-1">
          <DialogTitle className="text-center text-xl font-bold tracking-tight text-emerald-900 dark:text-emerald-200">
            নতুন শুটিং
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={<>নাম <span className="text-red-400">*</span></>}>
            <Input className={glassInputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="যেমন: নাটকের নাম" />
          </Field>
          <Field label="তারিখ">
            <Input type="date" className={glassInputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="পরিচালক">
            <DirectorField value={director} onChange={setDirector} className={glassInputClass} />
          </Field>
          <Field label="চ্যানেল">
            <ChannelField value={channel} onChange={setChannel} className={glassInputClass} />
          </Field>
          {isExternalChannel && (
            <Field label={<>চুক্তি মূল্য (৳) <span className="text-[10px] font-normal text-emerald-700/60">— এই ক্লায়েন্ট শুটিং থেকে প্রাপ্য</span></>}>
              <Input
                type="text"
                inputMode="decimal"
                className={glassInputClass}
                value={contractAmount}
                onChange={(e) => setContractAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="যেমন: 20000"
              />
            </Field>
          )}
          <Field label="স্থান">
            <Input className={glassInputClass} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="শুটিং লোকেশন" />
          </Field>
          <Field label="নোট">
            <Textarea rows={2} className={`${glassInputClass} resize-none`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="অতিরিক্ত তথ্য লিখুন..." />
          </Field>
        </div>
        <DialogFooter className="mt-2">
          <Button
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-[0_8px_20px_-4px_rgba(5,150,105,0.4)] hover:bg-emerald-700 active:scale-[0.98]"
          >
            <span>সংরক্ষণ করুন</span>
            <Check className="h-5 w-5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const glassDialogClass =
  "max-w-md gap-3 rounded-[28px] border border-white/40 bg-white/85 p-6 shadow-[0_20px_50px_-10px_rgba(5,150,105,0.25)] backdrop-blur-xl dark:bg-zinc-900/80 dark:border-white/10";

const glassInputClass =
  "h-12 rounded-2xl border-emerald-100/80 bg-white/70 px-4 text-emerald-950 shadow-sm placeholder:text-emerald-900/30 focus-visible:border-emerald-500/50 focus-visible:ring-2 focus-visible:ring-emerald-500/20 dark:bg-white/5 dark:border-white/10 dark:text-emerald-50 dark:placeholder:text-emerald-100/30";

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="ml-1 text-sm font-semibold text-emerald-800/80 dark:text-emerald-200/80">{label}</Label>
      {children}
    </div>
  );
}

function EditShootingDialog({ shooting, trigger }: { shooting: Shooting; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const { data: channels = [] } = useChannels();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(shooting.name);
  const [date, setDate] = useState(shooting.shoot_date);
  const [director, setDirector] = useState(shooting.director ?? "");
  const [channel, setChannel] = useState(shooting.channel ?? "");
  const [contractAmount, setContractAmount] = useState(
    shooting.contract_amount != null ? String(shooting.contract_amount) : "",
  );
  const [location, setLocation] = useState(shooting.location ?? "");
  const [note, setNote] = useState(shooting.note ?? "");

  const selectedChannel = channels.find((c) => c.name === channel.trim());
  const isExternalChannel =
    channel.trim().length > 0 && !selectedChannel?.is_own && !selectedChannel?.is_shared;

  // Reset form when dialog opens with latest data
  const handleOpenChange = (v: boolean) => {
    if (v) {
      setName(shooting.name);
      setDate(shooting.shoot_date);
      setDirector(shooting.director ?? "");
      setChannel(shooting.channel ?? "");
      setContractAmount(shooting.contract_amount != null ? String(shooting.contract_amount) : "");
      setLocation(shooting.location ?? "");
      setNote(shooting.note ?? "");
    }
    setOpen(v);
  };

  const update = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("নাম দিন");
      const chan = await ensureChannel(channel);
      const dir = await ensureDirector(director);
      const { error } = await supabase
        .from("shootings")
        .update({
          name: name.trim(),
          shoot_date: date,
          director: dir,
          channel: chan,
          location: location.trim() || null,
          note: note.trim() || null,
          contract_amount: isExternalChannel && contractAmount ? Number(contractAmount) : null,
        })
        .eq("id", shooting.id);
      if (error) {
        if (error.code === "23505") throw new Error("একই তারিখে এই নামে শুটিং আছে");
        throw error;
      }

      // Auto-sync attendance dates if shoot_date changed
      if (date !== shooting.shoot_date) {
        const { error: attErr } = await supabase
          .from("attendance")
          .update({ date })
          .eq("shooting_id", shooting.id);
        if (attErr) throw attErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shootings"] });
      qc.invalidateQueries({ queryKey: ["shooting-summaries"] });
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["channels"] });
      qc.invalidateQueries({ queryKey: ["directors"] });
      qc.invalidateQueries({ queryKey: ["client-channel-summary"] });
      toast.success("শুটিং আপডেট হয়েছে");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={glassDialogClass}>
        <DialogHeader className="pb-1">
          <DialogTitle className="text-center text-xl font-bold tracking-tight text-emerald-900 dark:text-emerald-200">
            শুটিং এডিট
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={<>নাম <span className="text-red-400">*</span></>}>
            <Input className={glassInputClass} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="তারিখ">
            <Input type="date" className={glassInputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="পরিচালক">
            <DirectorField value={director} onChange={setDirector} className={glassInputClass} />
          </Field>
          <Field label="চ্যানেল">
            <ChannelField value={channel} onChange={setChannel} className={glassInputClass} />
          </Field>
          {isExternalChannel && (
            <Field label={<>চুক্তি মূল্য (৳) <span className="text-[10px] font-normal text-emerald-700/60">— ক্লায়েন্ট থেকে প্রাপ্য</span></>}>
              <Input
                type="text"
                inputMode="decimal"
                className={glassInputClass}
                value={contractAmount}
                onChange={(e) => setContractAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="যেমন: 20000"
              />
            </Field>
          )}
          <Field label="স্থান">
            <Input className={glassInputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="নোট">
            <Textarea rows={2} className={`${glassInputClass} resize-none`} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {date !== shooting.shoot_date && (
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              তারিখ পরিবর্তন করায় এই শুটিংয়ের সকল হাজিরাও নতুন তারিখে আপডেট হবে।
            </p>
          )}
        </div>
        <DialogFooter className="mt-2">
          <Button
            onClick={() => update.mutate()}
            disabled={!name.trim() || update.isPending}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-base font-bold text-white shadow-[0_8px_20px_-4px_rgba(5,150,105,0.4)] hover:bg-emerald-700 active:scale-[0.98]"
          >
            <span>সংরক্ষণ করুন</span>
            <Check className="h-5 w-5" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
