import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { taka, toBn, bnDate } from "@/lib/format";
import { BrandAvatar, useChannels } from "@/lib/brand";
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
  BadgeDollarSign,
  Tv,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  Wallet,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";

type ChannelShooting = {
  id: string;
  name: string;
  shoot_date: string;
  contract_amount: number | null;
};

type ClientChannelRow = {
  channel: string;
  shooting_count: number;
  contract_total: number;
  received_total: number;
  due_total: number;
};

type QuickClientPaymentDialogProps = {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultChannel?: string;
  channelsSummary?: Array<{
    channel: string;
    due: number;
    contract: number;
    received: number;
  }>;
};

const PAYMENT_METHODS = ["ক্যাশ", "বিকাশ", "নগদ", "রকেট", "ব্যাংক", "চেক"];

export function QuickClientPaymentDialog({
  trigger,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  defaultChannel,
  channelsSummary,
}: QuickClientPaymentDialogProps) {
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

  const [channel, setChannel] = useState<string>(defaultChannel ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<string>("ক্যাশ");
  const [shootingId, setShootingId] = useState<string>("none");
  const [note, setNote] = useState("");

  const { data: allChannels = [] } = useChannels();

  // Fetch client channel summary if not provided via props
  const { data: summaryList = [] } = useQuery({
    queryKey: ["client-channel-summary"],
    enabled: open && !channelsSummary,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_channel_summary");
      if (error) throw error;
      return ((data ?? []) as ClientChannelRow[]).map((r) => ({
        channel: r.channel,
        shooting_count: Number(r.shooting_count),
        contract: Number(r.contract_total),
        received: Number(r.received_total),
        due: Number(r.due_total),
      }));
    },
  });

  const channelsList = useMemo(() => {
    if (channelsSummary) {
      return channelsSummary.map((c) => ({
        channel: c.channel,
        contract: c.contract,
        received: c.received,
        due: c.due,
      }));
    }
    return summaryList;
  }, [channelsSummary, summaryList]);

  // Client channels sorted: channels with dues > 0 first, then alphabetically
  const sortedChannels = useMemo(() => {
    return [...channelsList].sort((a, b) => {
      if (a.due > 0 && b.due <= 0) return -1;
      if (b.due > 0 && a.due <= 0) return 1;
      if (a.due > 0 && b.due > 0) return b.due - a.due;
      return a.channel.localeCompare(b.channel, "bn");
    });
  }, [channelsList]);

  // Channels with active dues (for quick-pick chips)
  const dueChannelsList = useMemo(() => {
    return sortedChannels.filter((c) => c.due > 0);
  }, [sortedChannels]);

  // Selected channel info
  const selectedChannelInfo = useMemo(() => {
    return channelsList.find((c) => c.channel === channel);
  }, [channelsList, channel]);

  const selectedChannelMeta = useMemo(() => {
    return allChannels.find((c) => c.name === channel);
  }, [allChannels, channel]);

  // Fetch shootings for selected channel
  const { data: shootings = [] } = useQuery({
    queryKey: ["client-shootings", channel],
    enabled: !!channel && open,
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

  const handleSelectChannel = (ch: string) => {
    setChannel(ch);
    setShootingId("none");
    const info = channelsList.find((c) => c.channel === ch);
    if (info && info.due > 0) {
      setAmount(String(Math.round(info.due)));
    } else {
      setAmount("");
    }
  };

  const handleOpenChange = (v: boolean) => {
    if (v) {
      if (defaultChannel) {
        handleSelectChannel(defaultChannel);
      } else if (!channel && dueChannelsList.length > 0) {
        handleSelectChannel(dueChannelsList[0].channel);
      }
      setDate(new Date().toISOString().slice(0, 10));
      setMethod("ক্যাশ");
      setShootingId("none");
    }
    setOpen(v);
  };

  const saveClientPayment = useMutation({
    mutationFn: async () => {
      if (!channel) throw new Error("অনুগ্রহ করে ক্লায়েন্ট চ্যানেল নির্বাচন করুন");
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("সঠিক টাকার পরিমাণ দিন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");

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
      qc.invalidateQueries({ queryKey: ["client-shootings", channel] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success(
        `৳ ${toBn(Number(amount).toLocaleString("en-IN"))} পেমেন্ট গৃহীত হয়েছে — ${channel}`,
      );
      setOpen(false);
      setAmount("");
      setNote("");
      setShootingId("none");
    },
    onError: (e: Error) => {
      toast.error(e.message || "পেমেন্ট গ্রহণ ব্যর্থ হয়েছে");
    },
  });

  const quickNotes = ["সম্পূর্ণ পরিশোধ", "১ম কিস্তি", "২য় কিস্তি", "অগ্রিম", "বকেয়া পরিশোধ"];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger ? (
        <DialogTrigger asChild>{trigger}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <button
            type="button"
            className="group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-card via-card to-emerald-500/5 p-4 text-left shadow-sm transition-all hover:border-emerald-500/40 hover:shadow-md active:scale-[0.99]"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-transform group-hover:scale-105">
                <BadgeDollarSign className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-foreground">ক্লায়েন্ট পেমেন্ট গ্রহণ</span>
                  <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    আদায়
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {dueChannelsList.length > 0
                    ? `${toBn(dueChannelsList.length)} টি চ্যানেলের বকেয়া সংগ্রহ করুন`
                    : "বাহিরের চ্যানেলের পেমেন্ট জমা দিন"}
                </div>
              </div>
            </div>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-transform group-hover:translate-x-0.5">
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
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <BadgeDollarSign className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-base font-bold">ক্লায়েন্ট পেমেন্ট গ্রহণ</DialogTitle>
              <p className="text-[11px] text-muted-foreground">বাহিরের চ্যানেল থেকে দ্রুত টাকা জমা নিন</p>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[75vh] overflow-y-auto px-5 py-4 space-y-4">
          {/* Quick Due Channels Chips */}
          {dueChannelsList.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-500" /> বকেয়া চ্যানেল ({toBn(dueChannelsList.length)} টি)
                </span>
                <span className="text-[10px] font-normal">ক্লিক করে বাছুন</span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {dueChannelsList.slice(0, 8).map((c) => {
                  const isSelected = channel === c.channel;
                  const chMeta = allChannels.find((ch) => ch.name === c.channel);
                  return (
                    <button
                      key={c.channel}
                      type="button"
                      onClick={() => handleSelectChannel(c.channel)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                        isSelected
                          ? "border-emerald-500 bg-emerald-500 text-white font-semibold shadow-sm"
                          : "border-border/70 bg-card hover:bg-accent/60 text-foreground"
                      }`}
                    >
                      <BrandAvatar kind="channel" name={c.channel} src={chMeta?.logo_url} size={18} />
                      <span className="truncate max-w-[100px]">{c.channel}</span>
                      <span
                        className={`font-mono text-[10px] font-bold ${
                          isSelected ? "text-white" : "text-destructive"
                        }`}
                      >
                        {taka(c.due)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Channel Select */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">ক্লায়েন্ট চ্যানেল</Label>
            <Select value={channel} onValueChange={handleSelectChannel}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="চ্যানেল নির্বাচন করুন…" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {sortedChannels.length === 0 && (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    কোনো বাহিরের চ্যানেল নেই
                  </div>
                )}
                {sortedChannels.map((c) => {
                  const chMeta = allChannels.find((ch) => ch.name === c.channel);
                  return (
                    <SelectItem key={c.channel} value={c.channel} className="py-2">
                      <div className="flex items-center justify-between gap-3 w-full">
                        <div className="flex items-center gap-2 min-w-0">
                          <BrandAvatar kind="channel" name={c.channel} src={chMeta?.logo_url} size={20} />
                          <span className="truncate font-medium">{c.channel}</span>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                            c.due > 0
                              ? "bg-destructive/10 text-destructive"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {c.due > 0 ? `বকেয়া ${taka(c.due)}` : "পরিশোধিত"}
                        </span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Selected Channel Financial Summary */}
          {selectedChannelInfo && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3.5 space-y-2">
              <div className="flex items-center gap-2.5">
                <BrandAvatar
                  kind="channel"
                  name={channel}
                  src={selectedChannelMeta?.logo_url}
                  size={42}
                />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm truncate">{channel}</div>
                  <div className="text-[11px] text-muted-foreground">বাহিরের চ্যানেল</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="rounded-xl bg-background/80 p-2 border border-border/50">
                  <div className="text-[10px] text-muted-foreground">মোট পাওনা</div>
                  <div className="text-xs font-bold">{taka(selectedChannelInfo.contract)}</div>
                </div>
                <div className="rounded-xl bg-background/80 p-2 border border-border/50">
                  <div className="text-[10px] text-muted-foreground">আদায় হয়েছে</div>
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    {taka(selectedChannelInfo.received)}
                  </div>
                </div>
                <div className="rounded-xl bg-background/80 p-2 border border-border/50">
                  <div className="text-[10px] text-muted-foreground">বর্তমান বকেয়া</div>
                  <div
                    className={`text-xs font-black ${
                      selectedChannelInfo.due > 0 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {taka(selectedChannelInfo.due)}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Amount Field with Shortcuts */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">প্রাপ্ত টাকার পরিমাণ (৳)</Label>
              {selectedChannelInfo && selectedChannelInfo.due > 0 && (
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.round(selectedChannelInfo.due)))}
                  className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                >
                  সম্পূর্ণ বকেয়া (৳ {toBn(Math.round(selectedChannelInfo.due))})
                </button>
              )}
            </div>
            <Input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="যেমন: ১০০০০"
              className="h-11 rounded-xl text-base font-bold"
            />
          </div>

          {/* Date & Payment Method */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">গ্রহণের তারিখ</Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-11 rounded-xl text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">পেমেন্ট মাধ্যম</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Specific Shooting or Auto FIFO Allocation */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">শুটিং নির্ধারণ</Label>
            <Select value={shootingId} onValueChange={setShootingId}>
              <SelectTrigger className="h-11 rounded-xl text-xs">
                <SelectValue placeholder="বাছুন" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="none" className="text-xs">
                  স্বয়ংক্রিয় বণ্টন (FIFO) — পুরাতন বকেয়া থেকে পরিশোধ
                </SelectItem>
                {shootings.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-xs">
                    {s.name} · {bnDate(s.shoot_date)}
                    {s.contract_amount ? ` (${taka(Number(s.contract_amount))})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Note & Quick Note Chips */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">নোট / বিবরণ (ঐচ্ছিক)</Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="যেমন: নাটকের ১ম কিস্তির টাকা"
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
            className="flex-1 rounded-xl gap-1.5 font-bold shadow-md bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={saveClientPayment.isPending || !channel || !amount}
            onClick={() => saveClientPayment.mutate()}
          >
            <CheckCircle2 className="h-4 w-4" />
            {saveClientPayment.isPending ? "সংরক্ষণ হচ্ছে…" : "টাকা গ্রহণ নিশ্চিত করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
