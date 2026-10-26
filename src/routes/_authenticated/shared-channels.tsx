import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  Plus,
  Users,
  TrendingUp,
  Receipt,
  Wallet,
  CircleAlert,
  ChevronRight,
  Trash2,
  Percent,
  BadgeDollarSign,
  Check,
  HandCoins,
} from "lucide-react";
import { taka, toBn, bnDate } from "@/lib/format";
import { BrandAvatar, useChannels } from "@/lib/brand";
import { MemberAvatar } from "@/components/member-avatar";
import { toast } from "sonner";
import { ConfirmDelete } from "@/components/confirm-delete";
import { SharedChannelShootings } from "@/components/shared-channel-shootings";
import { ShareReportButton } from "@/components/share-report-button";

import {
  PeriodFilter,
  defaultPeriod,
  inPeriod,
  periodRange,
  type PeriodValue,
} from "@/components/period-filter";

type ShootingRef = { id: string; name: string; shoot_date: string };

type ExpenseRow = {
  id: string;
  kind: string;
  label: string;
  date: string;
  amount: number;
  shooting_id: string | null;
  shooting_name: string | null;
  member_id: string | null;
};


export const Route = createFileRoute("/_authenticated/shared-channels")({
  component: SharedChannelsPage,
  head: () => ({
    meta: [
      { title: "শেয়ার চ্যানেল হিসাব · Kuakata Multimedia Finance" },
      {
        name: "description",
        content:
          "শেয়ার চ্যানেলের ইনকাম, খরচ ও মালিকদের ভাগের হিসাব ও পরিশোধ ব্যবস্থাপনা।",
      },
      { property: "og:title", content: "শেয়ার চ্যানেল হিসাব" },
      {
        property: "og:description",
        content: "দুই পক্ষের মালিকানার চ্যানেলের ইনকাম ভাগ ও পরিশোধের হিসাব।",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

export const SOURCE_LABEL: Record<string, string> = {
  facebook: "ফেসবুক",
  youtube: "ইউটিউব",
  ads: "বিজ্ঞাপন",
  other: "অন্যান্য",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "ক্যাশ",
  bkash: "বিকাশ",
  nagad: "নগদ",
  bank: "ব্যাংক",
};

type ChannelSummary = {
  channel_id: string;
  channel_name: string;
  income_total: number;
  expense_total: number;
  net_profit: number;
  partner_count: number;
};

type LedgerRow = {
  partner_id: string;
  partner_name: string;
  channel_id: string;
  channel_name: string | null;
  share_percent: number;
  net_profit: number;
  entitled: number;
  paid_total: number;
  due: number;
};

function useSharedSummary() {
  return useQuery({
    queryKey: ["shared-channel-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("shared_channel_summary");
      if (error) throw error;
      return ((data ?? []) as ChannelSummary[]).map((r) => ({
        ...r,
        income_total: Number(r.income_total),
        expense_total: Number(r.expense_total),
        net_profit: Number(r.net_profit),
        partner_count: Number(r.partner_count),
      }));
    },
  });
}

function useLedger() {
  return useQuery({
    queryKey: ["partner-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("partner_ledger");
      if (error) throw error;
      return ((data ?? []) as LedgerRow[]).map((r) => ({
        ...r,
        share_percent: Number(r.share_percent),
        net_profit: Number(r.net_profit),
        entitled: Number(r.entitled),
        paid_total: Number(r.paid_total),
        due: Number(r.due),
      }));
    },
  });
}

function SharedChannelsPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const { data: summary = [], isLoading } = useSharedSummary();
  const { data: ledger = [] } = useLedger();
  const { data: channels = [] } = useChannels();

  const totals = useMemo(
    () =>
      summary.reduce(
        (a, s) => ({
          income: a.income + s.income_total,
          expense: a.expense + s.expense_total,
          net: a.net + s.net_profit,
        }),
        { income: 0, expense: 0, net: 0 },
      ),
    [summary],
  );
  const totalDue = ledger.reduce((a, r) => a + Math.max(r.due, 0), 0);

  if (selected) {
    const row = summary.find((s) => s.channel_id === selected);
    if (row) {
      return (
        <ChannelDetail
          summary={row}
          ledger={ledger.filter((l) => l.channel_id === selected)}
          onBack={() => setSelected(null)}
        />
      );
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">শেয়ার চ্যানেল হিসাব</h1>
          <p className="text-sm text-muted-foreground">
            দুই পক্ষের মালিকানার চ্যানেলের ইনকাম ভাগ ও পরিশোধ
          </p>
        </div>
        <AddSharedChannelDialog />
      </div>

      <div className="grid grid-cols-2 gap-2 min-[700px]:grid-cols-4">
        <Stat label="মোট ইনকাম" value={taka(totals.income)} Icon={TrendingUp} tone="ok" />
        <Stat label="মোট খরচ" value={taka(totals.expense)} Icon={Receipt} tone="bad" />
        <Stat label="নিট লাভ" value={taka(totals.net)} Icon={Wallet} tone={totals.net >= 0 ? "ok" : "warn"} />
        <Stat label="ভাগ বকেয়া" value={taka(totalDue)} Icon={CircleAlert} tone={totalDue > 0 ? "warn" : "ok"} />
      </div>

      {isLoading && <div className="py-10 text-center text-muted-foreground">লোড হচ্ছে…</div>}

      {!isLoading && summary.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <Handshake className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">এখনও কোনো শেয়ার চ্যানেল নেই</p>
          <p className="mt-1 text-xs text-muted-foreground">
            উপরের "শেয়ার চ্যানেল যোগ" বাটন থেকে চ্যানেল যোগ করুন
          </p>
        </div>
      )}

      <div className="space-y-2 min-[700px]:grid min-[700px]:grid-cols-2 min-[700px]:gap-3 min-[700px]:space-y-0 xl:grid-cols-3">
        {summary.map((s) => {
          const ch = channels.find((c) => c.id === s.channel_id);
          const rows = ledger.filter((l) => l.channel_id === s.channel_id);
          return (
            <button
              key={s.channel_id}
              onClick={() => setSelected(s.channel_id)}
              className="flex w-full items-start gap-3 rounded-2xl border bg-card p-4 text-left transition hover:bg-accent/40 active:scale-[0.99]"
            >
              <BrandAvatar kind="channel" name={s.channel_name} src={ch?.logo_url} size={44} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{s.channel_name}</div>
                <div className="text-xs text-muted-foreground">
                  {toBn(s.partner_count)} জন মালিক
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                  <Mini label="ইনকাম" value={taka(s.income_total)} tone="ok" />
                  <Mini label="খরচ" value={taka(s.expense_total)} tone="bad" />
                  <Mini label="নিট" value={taka(s.net_profit)} accent tone={s.net_profit >= 0 ? "ok" : "bad"} />
                </div>
                {rows.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {rows.map((r) => (
                      <span
                        key={r.partner_id}
                        className="rounded-full bg-muted/60 px-2 py-0.5 text-[10.5px]"
                      >
                        {r.partner_name} · {taka(r.entitled)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <ChevronRight className="mt-3 h-5 w-5 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Mini({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: "ok" | "bad" }) {
  const color = tone === "ok" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-red-600 dark:text-red-400" : accent ? "text-primary" : "";
  return (
    <div className={`rounded-lg px-1 py-1 ${accent ? "bg-primary/10" : "bg-muted/40"}`}>
      <div className="text-[9.5px] text-muted-foreground">{label}</div>
      <div className={`text-[11px] font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: string;
  Icon: typeof Wallet;
  tone: "ok" | "warn" | "neutral" | "bad";
}) {
  const toneCls =
    tone === "ok"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tone === "warn"
      ? "bg-destructive/10 text-destructive"
      : tone === "bad"
      ? "bg-red-500/10 text-red-600 dark:text-red-400"
      : "bg-muted/50 text-foreground";
  const valueCls =
    tone === "ok"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warn" || tone === "bad"
      ? "text-red-600 dark:text-red-400"
      : "";
  return (
    <div className="rounded-2xl border bg-card p-3">
      <div className={`mb-1.5 grid h-8 w-8 place-items-center rounded-xl ${toneCls}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold ${valueCls}`}>{value}</div>
    </div>
  );
}

/* ---------------- Channel detail ---------------- */

type Partner = {
  id: string;
  partner_name: string;
  member_id: string | null;
  share_percent: number;
  note: string | null;
};

type Income = {
  id: string;
  source: string;
  amount: number;
  earned_at: string;
  note: string | null;
  shooting_id: string | null;
};

function ChannelDetail({
  summary,
  ledger,
  onBack,
}: {
  summary: ChannelSummary;
  ledger: LedgerRow[];
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const channelId = summary.channel_id;

  const { data: partners = [] } = useQuery({
    queryKey: ["channel-partners", channelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_partners")
        .select("id, partner_name, member_id, share_percent, note")
        .eq("channel_id", channelId)
        .order("partner_name");
      if (error) throw error;
      return ((data ?? []) as Partner[]).map((p) => ({
        ...p,
        share_percent: Number(p.share_percent),
      }));
    },
  });

  const partnerIds = partners.map((p) => p.id).join(",");
  const { data: partnerMembers = [] } = useQuery({
    queryKey: ["channel-partner-members", channelId, partnerIds],
    enabled: partners.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_partner_members")
        .select("partner_id, member_id, member:members(name)")
        .in("partner_id", partners.map((p) => p.id));
      if (error) throw error;
      return (data ?? []) as Array<{
        partner_id: string;
        member_id: string;
        member: { name: string } | null;
      }>;
    },
  });

  const membersByPartner = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of partnerMembers) {
      const arr = m.get(r.partner_id) ?? [];
      arr.push(r.member?.name ?? "—");
      m.set(r.partner_id, arr);
    }
    return m;
  }, [partnerMembers]);

  const { data: incomes = [] } = useQuery({
    queryKey: ["channel-incomes", channelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_incomes")
        .select("id, source, amount, earned_at, note, shooting_id")
        .eq("channel_id", channelId)
        .order("earned_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Income[]).map((i) => ({ ...i, amount: Number(i.amount) }));
    },
  });

  const { data: expenseData } = useQuery({
    queryKey: ["channel-expenses", channelId, summary.channel_name],
    queryFn: async () => {
      const { data: shoots, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date")
        .eq("channel", summary.channel_name)
        .order("shoot_date", { ascending: false });
      if (error) throw error;
      const shootings = (shoots ?? []) as ShootingRef[];
      const ids = shootings.map((s) => s.id);
      if (ids.length === 0) return { shootings, rows: [] as ExpenseRow[] };

      const [att, ext] = await Promise.all([
        supabase
          .from("attendance")
          .select("id, shooting_id, member_id, date, rate_override, members(name, rate)")
          .in("shooting_id", ids)

          .eq("present", true),
        supabase
          .from("shooting_expenses")
          .select("id, shooting_id, amount, note, spent_at")
          .in("shooting_id", ids),
      ]);
      if (att.error) throw att.error;
      if (ext.error) throw ext.error;

      const nameOf = new Map(shootings.map((s) => [s.id, s.name]));
      const rows: ExpenseRow[] = [];
      for (const a of att.data ?? []) {
        const amount = Number(a.rate_override ?? a.members?.rate ?? 0);
        if (!amount) continue;
        rows.push({
          id: `a-${a.id}`,
          kind: "হাজিরা",
          label: a.members?.name ?? "সদস্য",
          date: a.date,
          amount,
          shooting_id: a.shooting_id,
          shooting_name: a.shooting_id ? nameOf.get(a.shooting_id) ?? null : null,
          member_id: a.member_id,

        });
      }
      for (const e of ext.data ?? []) {
        rows.push({
          id: `e-${e.id}`,
          kind: "অন্যান্য খরচ",
          label: e.note ?? "খরচ",
          date: String(e.spent_at).slice(0, 10),
          amount: Number(e.amount),
          shooting_id: e.shooting_id,
          shooting_name: nameOf.get(e.shooting_id) ?? null,
          member_id: null,

        });
      }
      rows.sort((x, y) => (x.date < y.date ? 1 : -1));
      return { shootings, rows };
    },
  });

  const [period, setPeriod] = useState<PeriodValue>(defaultPeriod);
  const [shootFilter, setShootFilter] = useState("all");

  const shownIncomes = useMemo(
    () =>
      incomes.filter(
        (i) =>
          inPeriod(i.earned_at, period) &&
          (shootFilter === "all" || i.shooting_id === shootFilter),
      ),
    [incomes, period, shootFilter],
  );
  const shownExpenses = useMemo(
    () =>
      (expenseData?.rows ?? []).filter(
        (r) =>
          inPeriod(r.date, period) &&
          (shootFilter === "all" || r.shooting_id === shootFilter),
      ),
    [expenseData, period, shootFilter],
  );
  const filtered = useMemo(() => {
    const income = shownIncomes.reduce((a, i) => a + i.amount, 0);
    const expense = shownExpenses.reduce((a, r) => a + r.amount, 0);
    return { income, expense, net: income - expense };
  }, [shownIncomes, shownExpenses]);
  const isFiltered = period.preset !== "all" || shootFilter !== "all";

  const memberEarnings = useMemo(() => {
    const m = new Map<string, { id: string; name: string; days: number; earned: number }>();
    for (const r of shownExpenses) {
      if (r.kind !== "হাজিরা" || !r.member_id) continue;
      const cur = m.get(r.member_id) ?? { id: r.member_id, name: r.label, days: 0, earned: 0 };
      cur.days += 1;
      cur.earned += r.amount;
      m.set(r.member_id, cur);
    }
    return [...m.values()].sort((a, b) => b.earned - a.earned);
  }, [shownExpenses]);
  const memberEarnTotal = memberEarnings.reduce((a, r) => a + r.earned, 0);

  const groupedExpenses = useMemo(() => {
    const m = new Map<string, { key: string; kind: string; label: string; count: number; amount: number }>();
    for (const r of shownExpenses) {
      const key = `${r.kind}|${r.member_id ?? r.label}`;
      const cur = m.get(key) ?? { key, kind: r.kind, label: r.label, count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += r.amount;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [shownExpenses]);


  const totalPercent = partners.reduce((a, p) => a + p.share_percent, 0);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["shared-channel-summary"] });
    qc.invalidateQueries({ queryKey: ["partner-ledger"] });
    qc.invalidateQueries({ queryKey: ["channel-partners", channelId] });
    qc.invalidateQueries({ queryKey: ["channel-partner-members"] });
    qc.invalidateQueries({ queryKey: ["partner-member-ids"] });
    qc.invalidateQueries({ queryKey: ["daily-members"] });
    qc.invalidateQueries({ queryKey: ["channel-incomes", channelId] });
    qc.invalidateQueries({ queryKey: ["channel-expenses", channelId] });
  };


  const delIncome = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("channel_incomes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("ইনকাম মুছে ফেলা হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delPartner = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("channel_partners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      refresh();
      toast.success("মালিক মুছে ফেলা হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const bySource = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of incomes) m.set(i.source, (m.get(i.source) ?? 0) + i.amount);
    return [...m.entries()];
  }, [incomes]);

  const net = isFiltered ? filtered.net : summary.net_profit;
  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-xs font-medium text-primary hover:underline">
        ← ফিরে যান
      </button>

      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/75 p-5 text-primary-foreground shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide opacity-80">শেয়ার চ্যানেল</div>
            <div className="text-2xl font-bold">{summary.channel_name}</div>
          </div>
          <span className="rounded-full bg-primary-foreground/15 px-3 py-1 text-[11px] font-medium">
            {isFiltered ? "ফিল্টার অনুযায়ী" : "সর্বমোট"}
          </span>
        </div>
        <div className="mt-4">
          <div className="text-[11px] opacity-80">নিট লাভ</div>
          <div className={`text-3xl font-extrabold ${net >= 0 ? "text-emerald-100" : "text-red-200"}`}>{taka(net)}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-primary-foreground/15 p-3">
            <div className="text-[11px] opacity-80">ইনকাম</div>
            <div className="text-lg font-bold text-emerald-100">{taka(isFiltered ? filtered.income : summary.income_total)}</div>
          </div>
          <div className="rounded-2xl bg-primary-foreground/15 p-3">
            <div className="text-[11px] opacity-80">খরচ</div>
            <div className="text-lg font-bold text-red-200">{taka(isFiltered ? filtered.expense : summary.expense_total)}</div>
          </div>
        </div>
        {bySource.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {bySource.map(([src, amt]) => (
              <span key={src} className="rounded-full bg-primary-foreground/15 px-2.5 py-1 text-[11px] font-medium">
                {SOURCE_LABEL[src] ?? src}: {taka(amt)}
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] opacity-75">
          খরচে এই চ্যানেলের শুটিংয়ের হাজিরা, খাবার ও অন্যান্য খরচ ধরা হয়েছে।
        </p>
      </div>

      <PeriodFilter
        value={period}
        onChange={setPeriod}
        shootings={expenseData?.shootings ?? []}
        shootingId={shootFilter}
        onShootingChange={setShootFilter}
      />

      <ShareReportButton
        channelId={channelId}
        from={periodRange(period).from}
        to={periodRange(period).to}
        shootingId={shootFilter === "all" ? null : shootFilter}
      />

      <div className="grid gap-2 min-[700px]:grid-cols-2">
        <ChannelPayDialog
          channelId={channelId}
          channelName={summary.channel_name}
          members={memberEarnings}
          partners={partners}
          ledger={ledger}
          onDone={refresh}
        />
        <ShootingExpenseDialog
          shootings={expenseData?.shootings ?? []}
          onDone={refresh}
        />
      </div>

      <SharedChannelShootings
        channelName={summary.channel_name}
        excludedMemberIds={partnerMembers.map((p) => p.member_id)}
        onDone={refresh}
      />

      {/* Partners / ledger */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <Users className="h-4 w-4 text-primary" /> মালিকগণ ও ভাগ
          </h2>
          <PartnerDialog channelId={channelId} onDone={refresh} />
        </div>

        {partners.length > 0 && Math.abs(totalPercent - 100) > 0.01 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
            সব মালিকের শতকরা অংশ মিলে {toBn(totalPercent)}% — ১০০% হওয়া দরকার।
          </div>
        )}

        {partners.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            মালিক যোগ করুন (যেমন ৫০% / ৫০%)
          </div>
        )}

        {partners.map((p) => {
          const row = ledger.find((l) => l.partner_id === p.id);
          return (
            <div key={p.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{p.partner_name}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Percent className="h-3 w-3" /> {toBn(p.share_percent)}% অংশ
                  </div>
                  {(membersByPartner.get(p.id) ?? []).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(membersByPartner.get(p.id) ?? []).map((n) => (
                        <span
                          key={n}
                          className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.note && (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">{p.note}</div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <PartnerDialog
                    channelId={channelId}
                    partner={p}
                    onDone={refresh}
                    onDelete={() => delPartner.mutate(p.id)}
                    trigger={
                      <Button variant="outline" size="sm" className="h-8 px-2 text-[11px]">
                        সম্পাদনা
                      </Button>
                    }
                  />
                </div>

              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-muted/40 p-2">
                  <div className="text-[10px] text-muted-foreground">প্রাপ্য ভাগ</div>
                  <div className="text-[12.5px] font-semibold">{taka(row?.entitled ?? 0)}</div>
                </div>
                <div className="rounded-xl bg-emerald-500/10 p-2">
                  <div className="text-[10px] text-muted-foreground">পরিশোধ</div>
                  <div className="text-[12.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {taka(row?.paid_total ?? 0)}
                  </div>
                </div>
                <div
                  className={`rounded-xl p-2 ${
                    (row?.due ?? 0) > 0 ? "bg-destructive/10" : "bg-muted/40"
                  }`}
                >
                  <div className="text-[10px] text-muted-foreground">বকেয়া</div>
                  <div
                    className={`text-[12.5px] font-bold ${
                      (row?.due ?? 0) > 0 ? "text-destructive" : ""
                    }`}
                  >
                    {taka(row?.due ?? 0)}
                  </div>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <PayoutDialog partner={p} due={row?.due ?? 0} onDone={refresh} />
                <PayoutHistory partnerId={p.id} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Member attendance earnings */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <HandCoins className="h-4 w-4 text-primary" /> সদস্যদের হাজিরা আয়
          </h2>
          <span className="text-[11.5px] font-semibold">{taka(memberEarnTotal)}</span>
        </div>
        <p className="px-1 text-[11px] text-muted-foreground">
          এই চ্যানেলের শুটিংয়ে উপস্থিত সদস্যদের হাজিরা বাবদ আয় — এখান থেকেই পেমেন্ট করতে পারবেন।
        </p>

        {memberEarnings.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            এই ফিল্টারে কোনো হাজিরা আয় নেই
          </div>
        )}

        {memberEarnings.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
            <MemberAvatar name={m.name} photoUrl={null} size="md" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{m.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {toBn(m.days)} দিন উপস্থিত
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {taka(m.earned)}
              </div>
              <MemberPayDialog
                memberId={m.id}
                memberName={m.name}
                channelId={channelId}
                channelName={summary.channel_name}
                suggested={m.earned}
                onDone={refresh}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Incomes */}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <TrendingUp className="h-4 w-4 text-primary" /> ইনকাম তালিকা
          </h2>
          <IncomeDialog channelId={channelId} channelName={summary.channel_name} onDone={refresh} />
        </div>

        {shownIncomes.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            {isFiltered
              ? "এই ফিল্টারে কোনো আয় নেই"
              : "ফেসবুক / ইউটিউব / বিজ্ঞাপন ইনকাম যোগ করুন"}
          </div>
        )}

        {shownIncomes.map((i) => (
          <div key={i.id} className="flex items-start gap-3 rounded-2xl border bg-card p-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{SOURCE_LABEL[i.source] ?? i.source}</div>
              <div className="text-[11px] text-muted-foreground">{bnDate(i.earned_at)}</div>
              {i.note && <div className="text-[11px] text-muted-foreground">{i.note}</div>}
              {partners.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {partners.map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full bg-muted/60 px-2 py-0.5 text-[10px]"
                    >
                      {p.partner_name}: {taka((i.amount * p.share_percent) / 100)}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {taka(i.amount)}
              </div>
              <div className="mt-1 flex items-center justify-end gap-1">
                <IncomeDialog
                  channelId={channelId}
                  channelName={summary.channel_name}
                  income={i}
                  onDone={refresh}
                />
                <ConfirmDelete
                  title="ইনকাম মুছে ফেলবেন?"
                  description="এই ইনকাম এন্ট্রি মুছে গেলে মালিকদের ভাগ নতুন করে হিসাব হবে।"
                  onConfirm={() => delIncome.mutate(i.id)}
                  trigger={
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Expenses */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <Receipt className="h-4 w-4 text-primary" /> ব্যয় তালিকা
          </h2>
          <span className="text-[11.5px] font-semibold">{taka(filtered.expense)}</span>
        </div>

        {shownExpenses.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            এই ফিল্টারে কোনো ব্যয় নেই
          </div>
        )}

        {groupedExpenses.map((r) => (
          <div key={r.key} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-destructive/10 text-destructive">
              <Receipt className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{r.label}</div>
              <div className="text-[11px] text-muted-foreground">
                {r.kind} · {toBn(r.count)}টি শুটিং
              </div>
            </div>
            <div className="shrink-0 text-sm font-bold">{taka(r.amount)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Dialogs ---------------- */

function PartnerDialog({
  channelId,
  partner,
  onDone,
  onDelete,
  trigger,
}: {
  channelId: string;
  partner?: Partner;
  onDone: () => void;
  onDelete?: () => void;
  trigger?: React.ReactNode;
}) {

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(partner?.partner_name ?? "");
  const [percent, setPercent] = useState(String(partner?.share_percent ?? 50));
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [note, setNote] = useState(partner?.note ?? "");

  const { data: members = [] } = useQuery({
    queryKey: ["members", "names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("members").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const { data: existingIds } = useQuery({
    queryKey: ["partner-member-ids", partner?.id],
    enabled: !!partner?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channel_partner_members")
        .select("member_id")
        .eq("partner_id", partner!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.member_id as string);
    },
  });

  useEffect(() => {
    if (!open) return;
    setName(partner?.partner_name ?? "");
    setPercent(String(partner?.share_percent ?? 50));
    setNote(partner?.note ?? "");
    if (!partner) setMemberIds([]);
  }, [open, partner]);

  useEffect(() => {
    if (open && existingIds) setMemberIds(existingIds);
  }, [open, existingIds]);

  const toggleMember = (id: string) =>
    setMemberIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("মালিকের নাম লিখুন");
      const pct = Number(percent);
      if (!(pct > 0 && pct <= 100)) throw new Error("শতকরা অংশ ১–১০০ এর মধ্যে দিন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const payload = {
        owner_id: u.user.id,
        channel_id: channelId,
        partner_name: trimmed,
        share_percent: pct,
        member_id: memberIds[0] ?? null,
        note: note.trim() || null,
      };
      let partnerId = partner?.id;
      if (partner) {
        const { error } = await supabase
          .from("channel_partners")
          .update(payload)
          .eq("id", partner.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("channel_partners")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        partnerId = data.id;
      }
      if (!partnerId) return;
      const { error: delErr } = await supabase
        .from("channel_partner_members")
        .delete()
        .eq("partner_id", partnerId);
      if (delErr) throw delErr;
      if (memberIds.length > 0) {
        const { error: insErr } = await supabase.from("channel_partner_members").insert(
          memberIds.map((mid) => ({
            owner_id: u.user!.id,
            partner_id: partnerId!,
            member_id: mid,
          })),
        );
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      onDone();
      toast.success("সংরক্ষণ হয়েছে");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="h-8">
            <Plus className="mr-1 h-3.5 w-3.5" /> মালিক
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{partner ? "মালিক সম্পাদনা" : "নতুন মালিক যোগ"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>মালিকের নাম</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="নাম" />
          </div>
          <div className="space-y-1.5">
            <Label>শতকরা অংশ (%)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>সদস্য যুক্ত করুন (একাধিক)</Label>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border p-2">
              {members.length === 0 && (
                <div className="p-2 text-xs text-muted-foreground">কোনো সদস্য নেই</div>
              )}
              {members.map((m) => {
                const on = memberIds.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleMember(m.id)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-sm transition ${
                      on ? "bg-primary/10 font-medium text-primary" : "hover:bg-muted/60"
                    }`}
                  >
                    <span className="truncate">{m.name}</span>
                    {on && <Check className="h-4 w-4 shrink-0" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              যুক্ত সদস্যরা এই চ্যানেলের শুটিং হাজিরার তালিকায় আসবে না।
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>নোট (ঐচ্ছিক)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {save.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
          </Button>
          {partner && onDelete && (
            <ConfirmDelete
              title="মালিক মুছে ফেলবেন?"
              description={`${partner.partner_name} এর ভাগ ও পরিশোধের হিসাব মুছে যাবে।`}
              onConfirm={() => {
                onDelete();
                setOpen(false);
              }}
              trigger={
                <Button type="button" variant="outline" className="w-full text-destructive">
                  <Trash2 className="mr-1.5 h-4 w-4" /> মালিক মুছে ফেলুন
                </Button>
              }
            />
          )}
        </form>

      </DialogContent>
    </Dialog>
  );
}

function IncomeDialog({
  channelId,
  channelName,
  income,
  onDone,
}: {
  channelId: string;
  channelName: string;
  income?: Income;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState(income?.source ?? "facebook");
  const [amount, setAmount] = useState(income ? String(income.amount) : "");
  const [date, setDate] = useState(
    income?.earned_at ?? new Date().toISOString().slice(0, 10),
  );
  const [shootingId, setShootingId] = useState(income?.shooting_id ?? "none");
  const [note, setNote] = useState(income?.note ?? "");

  const { data: shootings = [] } = useQuery({
    queryKey: ["shootings", "by-channel", channelName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date")
        .eq("channel", channelName)
        .order("shoot_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string; shoot_date: string }[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("সঠিক পরিমাণ লিখুন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const payload = {
        shooting_id: shootingId === "none" ? null : shootingId,
        source: source as "facebook" | "youtube" | "ads" | "other",
        amount: amt,
        earned_at: date,
        note: note.trim() || null,
      };
      if (income) {
        const { error } = await supabase
          .from("channel_incomes")
          .update(payload)
          .eq("id", income.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("channel_incomes").insert({
          owner_id: u.user.id,
          channel_id: channelId,
          ...payload,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      onDone();
      toast.success(
        income ? "ইনকাম আপডেট হয়েছে" : "ইনকাম যোগ হয়েছে — মালিকদের ভাগ অটো হিসাব হয়েছে",
      );
      if (!income) {
        setAmount("");
        setNote("");
      }
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && income) {
          setSource(income.source);
          setAmount(String(income.amount));
          setDate(income.earned_at);
          setShootingId(income.shooting_id ?? "none");
          setNote(income.note ?? "");
        }
      }}
    >
      <DialogTrigger asChild>
        {income ? (
          <Button variant="outline" size="sm" className="h-7 px-2 text-[11px]">
            সম্পাদনা
          </Button>
        ) : (
          <Button size="sm" className="h-8">
            <Plus className="mr-1 h-3.5 w-3.5" /> ইনকাম
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{income ? "ইনকাম সম্পাদনা" : "ইনকাম যোগ করুন"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>উৎস</Label>
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
          <div className="space-y-1.5">
            <Label>পরিমাণ (৳)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>তারিখ</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>শুটিং (ঐচ্ছিক)</Label>
            <Select value={shootingId} onValueChange={setShootingId}>
              <SelectTrigger>
                <SelectValue placeholder="শুটিং বাছুন" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">কোনোটি নয়</SelectItem>
                {shootings.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {bnDate(s.shoot_date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>নোট (ঐচ্ছিক)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {save.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ShootingExpenseDialog({
  shootings,
  onDone,
}: {
  shootings: ShootingRef[];
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [shootingId, setShootingId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!shootingId) throw new Error("শুটিং বাছুন");
      if (!amt || amt <= 0) throw new Error("সঠিক পরিমাণ দিন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন করুন");
      const { error } = await supabase.from("shooting_expenses").insert({
        owner_id: u.user.id,
        shooting_id: shootingId,
        amount: amt,
        note: note.trim() || null,
        spent_at: new Date(`${date}T12:00:00`).toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("খরচ যোগ হয়েছে");
      setOpen(false);
      setShootingId("");
      setAmount("");
      setNote("");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Receipt className="mr-1.5 h-4 w-4" /> শুটিং খরচ যোগ করুন
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88dvh] max-w-md overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>শুটিং খরচ যোগ করুন</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label>শুটিং</Label>
            <Select value={shootingId} onValueChange={setShootingId}>
              <SelectTrigger>
                <SelectValue placeholder="শুটিং বাছুন" />
              </SelectTrigger>
              <SelectContent>
                {shootings.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {bnDate(s.shoot_date)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {shootings.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                এই চ্যানেলে এখনো কোনো শুটিং নেই।
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>পরিমাণ (৳)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label>তারিখ</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>নোট (যেমন খাবার, যাতায়াত)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {save.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayoutDialog({

  partner,
  due,
  onDone,
}: {
  partner: Partner;
  due: number;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [account, setAccount] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("সঠিক পরিমাণ লিখুন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const { error } = await supabase.from("partner_payouts").insert({
        owner_id: u.user.id,
        partner_id: partner.id,
        amount: amt,
        method,
        bank_account_number: account.trim() || null,
        paid_at: date,
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      onDone();
      toast.success("ভাগ পরিশোধ লিপিবদ্ধ হয়েছে");
      setAmount("");
      setNote("");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && due > 0) setAmount(String(Math.round(due)));
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 flex-1">
          <BadgeDollarSign className="mr-1 h-3.5 w-3.5" /> ভাগ পরিশোধ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{partner.partner_name} — ভাগ পরিশোধ</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="rounded-xl bg-muted/50 px-3 py-2 text-xs">
            বকেয়া: <span className="font-bold">{taka(due)}</span>
          </div>
          <div className="space-y-1.5">
            <Label>পরিমাণ (৳)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>মাধ্যম</Label>
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
          {method !== "cash" && (
            <div className="space-y-1.5">
              <Label>অ্যাকাউন্ট/নম্বর (ঐচ্ছিক)</Label>
              <Input value={account} onChange={(e) => setAccount(e.target.value)} />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>তারিখ</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>নোট (ঐচ্ছিক)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          </div>
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {save.isPending ? "সংরক্ষণ হচ্ছে…" : "পরিশোধ সংরক্ষণ"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PayoutHistory({ partnerId }: { partnerId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data: rows = [] } = useQuery({
    queryKey: ["partner-payouts", partnerId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("partner_payouts")
        .select("id, amount, method, bank_account_number, note, paid_at")
        .eq("partner_id", partnerId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        amount: number;
        method: string;
        bank_account_number: string | null;
        note: string | null;
        paid_at: string;
      }[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_payouts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["partner-payouts", partnerId] });
      qc.invalidateQueries({ queryKey: ["partner-ledger"] });
      toast.success("মুছে ফেলা হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 flex-1">
          <Wallet className="mr-1 h-3.5 w-3.5" /> ইতিহাস
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>পরিশোধের ইতিহাস</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {rows.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              এখনও কোনো পরিশোধ নেই
            </p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-2 rounded-xl border bg-card p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{taka(Number(r.amount))}</div>
                <div className="text-[11px] text-muted-foreground">
                  {bnDate(r.paid_at)} · {METHOD_LABEL[r.method] ?? r.method}
                </div>
                {r.bank_account_number && (
                  <div className="text-[11px] text-muted-foreground">
                    অ্যাকাউন্ট: {r.bank_account_number}
                  </div>
                )}
                {r.note && <div className="text-[11px] text-muted-foreground">{r.note}</div>}
              </div>
              <ConfirmDelete
                title="পরিশোধ মুছে ফেলবেন?"
                description="এই পরিশোধ মুছে গেলে বকেয়া আবার বেড়ে যাবে।"
                onConfirm={() => del.mutate(r.id)}
                trigger={
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                }
              />
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddSharedChannelDialog() {
  const qc = useQueryClient();
  const { data: channels = [] } = useChannels();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [channelId, setChannelId] = useState("");
  const [name, setName] = useState("");

  const options = channels.filter((c) => !c.is_shared);

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      if (mode === "existing") {
        if (!channelId) throw new Error("চ্যানেল বাছুন");
        const { error } = await supabase
          .from("channels")
          .update({ is_shared: true })
          .eq("id", channelId);
        if (error) throw error;
      } else {
        const trimmed = name.trim();
        if (!trimmed) throw new Error("চ্যানেলের নাম লিখুন");
        const existing = channels.find(
          (c) => c.name.toLowerCase() === trimmed.toLowerCase(),
        );
        if (existing) {
          const { error } = await supabase
            .from("channels")
            .update({ is_shared: true })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("channels")
            .insert({ owner_id: u.user.id, name: trimmed, is_shared: true });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      qc.invalidateQueries({ queryKey: ["shared-channel-summary"] });
      qc.invalidateQueries({ queryKey: ["partner-ledger"] });
      toast.success("শেয়ার চ্যানেল যোগ হয়েছে");
      setOpen(false);
      setChannelId("");
      setName("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> শেয়ার চ্যানেল যোগ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>শেয়ার চ্যানেল যোগ</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={mode === "existing" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("existing")}
            >
              বিদ্যমান চ্যানেল
            </Button>
            <Button
              type="button"
              variant={mode === "new" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("new")}
            >
              নতুন চ্যানেল
            </Button>
          </div>

          {mode === "existing" ? (
            <div className="space-y-1.5">
              <Label>চ্যানেল</Label>
              <Select value={channelId} onValueChange={setChannelId}>
                <SelectTrigger>
                  <SelectValue placeholder="চ্যানেল বাছুন" />
                </SelectTrigger>
                <SelectContent>
                  {options.length === 0 && (
                    <div className="px-2 py-2 text-xs text-muted-foreground">
                      সব চ্যানেল ইতিমধ্যে শেয়ার করা
                    </div>
                  )}
                  {options.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="flex items-center gap-2">
                        <BrandAvatar kind="channel" name={c.name} src={c.logo_url} size={18} />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>চ্যানেলের নাম</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="যেমন: Kuakata Drama"
              />
            </div>
          )}

          <Button
            className="w-full"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "যোগ হচ্ছে…" : "যোগ করুন"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Member attendance payment ---------------- */

const PAY_METHODS = ["cash", "bkash", "nagad", "rocket", "upay", "bank"] as const;
const PAY_METHOD_LABEL: Record<string, string> = {
  cash: "ক্যাশ",
  bkash: "বিকাশ",
  nagad: "নগদ",
  rocket: "রকেট",
  upay: "উপায়",
  bank: "ব্যাংক",
};

function ChannelPayDialog({
  channelId,
  channelName,
  members,
  partners,
  ledger,
  onDone,
}: {
  channelId: string;
  channelName: string;
  members: { id: string; name: string; days: number; earned: number }[];
  partners: Partner[];
  ledger: LedgerRow[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [acct, setAcct] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const kind = target.startsWith("m:") ? "member" : target.startsWith("p:") ? "partner" : null;
  const id = target.slice(2);
  const member = kind === "member" ? members.find((m) => m.id === id) : undefined;
  const partner = kind === "partner" ? partners.find((p) => p.id === id) : undefined;
  const row = partner ? ledger.find((l) => l.partner_id === partner.id) : undefined;

  const { data: balance } = useQuery({
    queryKey: ["balance", id, channelId],
    enabled: open && kind === "member" && !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("member_balance", {
        _member_id: id,
        _channel_id: channelId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["member_accounts", id],
    enabled: open && kind === "member" && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_accounts")
        .select("kind, account_number")
        .eq("member_id", id);
      if (error) throw error;
      return (data ?? []) as { kind: string; account_number: string }[];
    },
  });

  useEffect(() => {
    if (!open) return;
    if (kind === "member" && member) {
      setAmount(String(Math.round(member.earned)));
      setNote(`${channelName} — হাজিরা পরিশোধ`);
    } else if (kind === "partner" && partner) {
      setAmount(String(Math.max(0, Math.round(row?.due ?? 0))));
      setNote(`${channelName} — ${partner.partner_name} ভাগ পরিশোধ`);
    }
  }, [open, target, kind, member, partner, row?.due, channelName]);

  useEffect(() => {
    if (method === "cash" || kind !== "member") {
      setAcct("");
      return;
    }
    const match = accounts.find((a) => a.kind === method);
    setAcct(match ? match.account_number : "");
  }, [method, accounts, kind]);

  const pay = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!kind) throw new Error("কাকে পেমেন্ট করবেন তা বাছুন");
      if (!(amt > 0)) throw new Error("সঠিক পরিমাণ দিন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      if (kind === "member") {
        const { error } = await supabase.from("payments").insert({
          owner_id: u.user.id,
          member_id: id,
          channel_id: channelId,
          amount: amt,
          method,
          bank_account_number: method !== "cash" && acct.trim() ? acct.trim() : null,
          note: note.trim() || null,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("partner_payouts").insert({
          owner_id: u.user.id,
          partner_id: id,
          amount: amt,
          method,
          bank_account_number: acct.trim() || null,
          paid_at: date,
          note: note.trim() || null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["member-payments"] });
      qc.invalidateQueries({ queryKey: ["balance"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["partner-payouts"] });
      onDone();
      toast.success("পেমেন্ট সংরক্ষিত");
      setTarget("");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full">
          <BadgeDollarSign className="mr-1.5 h-4 w-4" /> পেমেন্ট করুন
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{channelName} — পেমেন্ট</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>কাকে পেমেন্ট করবেন</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger>
                <SelectValue placeholder="নাম বাছুন" />
              </SelectTrigger>
              <SelectContent>
                {partners.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>পক্ষ</SelectLabel>
                    {partners.map((p) => (
                      <SelectItem key={p.id} value={`p:${p.id}`}>
                        {p.partner_name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {members.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>হাজিরার সদস্য</SelectLabel>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={`m:${m.id}`}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          {member && (
            <div className="rounded-xl bg-muted/40 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  এই চ্যানেলে হাজিরা আয় ({toBn(member.days)} দিন)
                </span>
                <b>{taka(member.earned)}</b>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">মোট বর্তমান ব্যালেন্স</span>
                <b className="text-primary">{taka(balance ?? 0)}</b>
              </div>
            </div>
          )}

          {partner && (
            <div className="rounded-xl bg-muted/40 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">প্রাপ্য ভাগ</span>
                <b>{taka(row?.entitled ?? 0)}</b>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">পরিশোধ</span>
                <b>{taka(row?.paid_total ?? 0)}</b>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">বকেয়া</span>
                <b className="text-primary">{taka(row?.due ?? 0)}</b>
              </div>
            </div>
          )}

          {kind && (
            <>
              <div className="space-y-1.5">
                <Label>পরিমাণ</Label>
                <Input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                />
              </div>

              <div className="space-y-1.5">
                <Label>পেমেন্ট মাধ্যম</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAY_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAY_METHOD_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {method !== "cash" && (
                <div className="space-y-1.5">
                  <Label>
                    {method === "bank" ? "অ্যাকাউন্ট নম্বর (ঐচ্ছিক)" : "নম্বর (ঐচ্ছিক)"}
                  </Label>
                  <Input
                    inputMode="numeric"
                    value={acct}
                    onChange={(e) => setAcct(e.target.value.replace(/[^0-9]/g, ""))}
                  />
                </div>
              )}

              {kind === "partner" && (
                <div className="space-y-1.5">
                  <Label>তারিখ</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>নোট</Label>
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>

              <Button className="w-full" disabled={pay.isPending} onClick={() => pay.mutate()}>
                {pay.isPending ? "সংরক্ষণ হচ্ছে…" : "পেমেন্ট সংরক্ষণ করুন"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberPayDialog({

  memberId,
  memberName,
  channelId,
  channelName,
  suggested,
  onDone,
}: {
  memberId: string;
  memberName: string;
  channelId: string;
  channelName: string;
  suggested: number;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(Math.round(suggested)));
  const [method, setMethod] = useState<string>("cash");
  const [acct, setAcct] = useState("");
  const [note, setNote] = useState(`${channelName} — হাজিরা পরিশোধ`);

  const { data: balance } = useQuery({
    queryKey: ["balance", memberId, channelId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("member_balance", {
        _member_id: memberId,
        _channel_id: channelId,
      });
      if (error) throw error;
      return Number(data ?? 0);
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["member_accounts", memberId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_accounts")
        .select("kind, account_number")
        .eq("member_id", memberId);
      if (error) throw error;
      return (data ?? []) as { kind: string; account_number: string }[];
    },
  });

  useEffect(() => {
    if (!open) return;
    setAmount(String(Math.round(suggested)));
    setNote(`${channelName} — হাজিরা পরিশোধ`);
  }, [open, suggested, channelName]);

  useEffect(() => {
    if (method === "cash") {
      setAcct("");
      return;
    }
    const match = accounts.find((a) => a.kind === method);
    setAcct(match ? match.account_number : "");
  }, [method, accounts]);

  const pay = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!(amt > 0)) throw new Error("সঠিক পরিমাণ দিন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const { error } = await supabase.from("payments").insert({
        owner_id: u.user.id,
        member_id: memberId,
        channel_id: channelId,
        amount: amt,
        method,
        bank_account_number: method !== "cash" && acct.trim() ? acct.trim() : null,
        note: note.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["member-payments", memberId] });
      qc.invalidateQueries({ queryKey: ["balance"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onDone();
      toast.success("পেমেন্ট সংরক্ষিত");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="mt-1 h-7 px-2 text-[11px]">
          <BadgeDollarSign className="mr-1 h-3.5 w-3.5" /> পেমেন্ট
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{memberName} — পেমেন্ট</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-muted/40 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{channelName} হাজিরা আয়</span>
              <b>{taka(suggested)}</b>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-muted-foreground">মোট বর্তমান ব্যালেন্স</span>
              <b className="text-primary">{taka(balance ?? 0)}</b>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>পরিমাণ</Label>
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>পেমেন্ট মাধ্যম</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAY_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAY_METHOD_LABEL[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {method !== "cash" && (
            <div className="space-y-1.5">
              <Label>{method === "bank" ? "অ্যাকাউন্ট নম্বর (ঐচ্ছিক)" : "নম্বর (ঐচ্ছিক)"}</Label>
              <Input
                inputMode="numeric"
                value={acct}
                onChange={(e) => setAcct(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>নোট</Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <Button className="w-full" disabled={pay.isPending} onClick={() => pay.mutate()}>
            {pay.isPending ? "সংরক্ষণ হচ্ছে…" : "পেমেন্ট সংরক্ষণ করুন"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
