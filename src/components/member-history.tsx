import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { taka, toBn, bnDate } from "@/lib/format";
import { Wallet, CalendarCheck, ChevronDown, Handshake } from "lucide-react";

type PaymentRow = { id: string; amount: number; paid_at: string; note: string | null; method: string | null; bank_account_number: string | null };

const METHOD_LABEL: Record<string, string> = {
  cash: "ক্যাশ",
  bkash: "বিকাশ",
  nagad: "নগদ",
  rocket: "রকেট",
  upay: "উপায়",
  bank: "ব্যাংক",
};
type AttendanceRow = {
  id: string;
  date: string;
  present: boolean;
  rate_override: number | null;
  shooting_id: string | null;
  shootings: { name: string; channel: string | null } | null;
};

const TAB_STYLE = {
  payments: {
    text: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10",
    page: "bg-blue-500/[0.07]",
  },
  attendance: {
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    page: "bg-emerald-500/[0.07]",
  },
  shared: {
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    page: "bg-amber-500/[0.07]",
  },
} as const;

export function MemberHistory({ memberId, memberRate }: { memberId: string; memberRate: number }) {
  const [tab, setTab] = useState<"payments" | "attendance" | "shared">("payments");

  const payments = useQuery({
    queryKey: ["member-payments", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, paid_at, note, method, bank_account_number")
        .eq("member_id", memberId)
        .order("paid_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });

  const attendance = useQuery({
    queryKey: ["member-attendance", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, date, present, rate_override, shooting_id, shootings(name, channel)")
        .eq("member_id", memberId)
        .order("date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AttendanceRow[];
    },
  });

  const sharedChannels = useQuery({
    queryKey: ["shared-channel-names"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("name")
        .eq("is_shared", true);
      if (error) throw error;
      return (data ?? []).map((c) => c.name as string);
    },
  });

  const totalPaid = (payments.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const presentDays = (attendance.data ?? []).filter((a) => a.present).length;

  const sharedEarnings = (() => {
    const names = sharedChannels.data ?? [];
    if (names.length === 0) return [] as { channel: string; days: number; earned: number }[];
    const m = new Map<string, { channel: string; days: number; earned: number }>();
    for (const a of attendance.data ?? []) {
      const ch = a.shootings?.channel;
      if (!a.present || !ch || !names.includes(ch)) continue;
      const cur = m.get(ch) ?? { channel: ch, days: 0, earned: 0 };
      cur.days += 1;
      cur.earned += Number(a.rate_override ?? memberRate ?? 0);
      m.set(ch, cur);
    }
    return [...m.values()].sort((x, y) => y.earned - x.earned);
  })();

  const isSharedRow = (a: AttendanceRow) =>
    !!a.shootings?.channel && (sharedChannels.data ?? []).includes(a.shootings.channel);
  const rows = attendance.data ?? [];
  const sharedRows = rows.filter(isSharedRow);
  const ownRows = rows.filter((a) => !isSharedRow(a));

  return (
    <div className="rounded-2xl border bg-card">
      <div className="grid grid-cols-3 gap-1 rounded-t-2xl bg-muted/40 p-1">
        <TabBtn
          active={tab === "payments"}
          onClick={() => setTab("payments")}
          Icon={Wallet}
          label="পেমেন্ট"
          badge={toBn(payments.data?.length ?? 0)}
          color={TAB_STYLE.payments}
        />
        <TabBtn
          active={tab === "attendance"}
          onClick={() => setTab("attendance")}
          Icon={CalendarCheck}
          label="হাজিরা"
          badge={toBn(presentDays)}
          color={TAB_STYLE.attendance}
        />
        <TabBtn
          active={tab === "shared"}
          onClick={() => setTab("shared")}
          Icon={Handshake}
          label="অন্যান্য চ্যানেল"
          badge={toBn(sharedRows.filter((a) => a.present).length)}
          color={TAB_STYLE.shared}
        />
      </div>

      <div
        key={tab}
        className={`animate-in fade-in slide-in-from-bottom-2 duration-200 overflow-hidden rounded-b-2xl ${TAB_STYLE[tab].page}`}
      >
        {tab === "payments" ? (
          <div>
          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="text-muted-foreground">মোট পরিশোধিত</span>
            <b className="text-blue-600 dark:text-blue-400">{taka(totalPaid)}</b>
          </div>
          {payments.isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">লোড হচ্ছে…</div>
          ) : (payments.data ?? []).length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">কোনো পেমেন্ট নেই</div>
          ) : (
            <ScrollList>
              {(payments.data ?? []).map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      <span>{bnDate(p.paid_at)}</span>
                      {p.method && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                          {METHOD_LABEL[p.method] ?? p.method}
                        </span>
                      )}
                    </div>
                    {p.bank_account_number && (
                      <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                        A/C: {toBn(p.bank_account_number)}
                      </div>
                    )}
                    {p.note && <div className="truncate text-[11px] text-muted-foreground">{p.note}</div>}
                  </div>
                  <b className="shrink-0 text-sm text-success">{taka(Number(p.amount))}</b>
                </li>
              ))}
            </ScrollList>
          )}
        </div>
      ) : tab === "attendance" ? (
        <div>
          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="text-muted-foreground">উপস্থিত দিন</span>
            <b className="text-emerald-600 dark:text-emerald-400">{toBn(ownRows.filter((a) => a.present).length)} দিন</b>
          </div>
          {attendance.isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">লোড হচ্ছে…</div>
          ) : ownRows.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">কোনো হাজিরা নেই</div>
          ) : (
            <ScrollList>
              {ownRows.map((a) => (
                <AttendanceItem key={a.id} a={a} memberRate={memberRate} />
              ))}
            </ScrollList>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between px-3 py-2 text-xs">
            <span className="text-muted-foreground">শেয়ার চ্যানেলের উপস্থিত দিন</span>
            <b className={`text-amber-600 dark:text-amber-400`}>{toBn(sharedRows.filter((a) => a.present).length)} দিন</b>
          </div>
          {sharedEarnings.length > 0 && (
            <div className="border-t bg-muted/20 px-3 py-2">
              <div className="mb-1 text-[11px] font-semibold text-muted-foreground">
                চ্যানেল অনুযায়ী আয়
              </div>
              <ul className="space-y-1">
                {sharedEarnings.map((s) => (
                  <li key={s.channel} className="flex items-center justify-between gap-2 text-[11.5px]">
                    <span className="truncate">
                      {s.channel}
                      <span className="ml-1 text-muted-foreground">({toBn(s.days)} দিন)</span>
                    </span>
                    <b className="shrink-0 text-amber-600 dark:text-amber-400">{taka(s.earned)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {attendance.isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">লোড হচ্ছে…</div>
          ) : sharedRows.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">শেয়ার চ্যানেলে কোনো হাজিরা নেই</div>
          ) : (
            <ScrollList>
              {sharedRows.map((a) => (
                <AttendanceItem key={a.id} a={a} memberRate={memberRate} />
              ))}
            </ScrollList>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

function AttendanceItem({ a, memberRate }: { a: AttendanceRow; memberRate: number }) {
  const rate = a.rate_override ?? memberRate;
  return (
    <li className="flex items-start justify-between gap-2 px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs">{bnDate(a.date)}</div>
        {a.shootings?.name && (
          <div className="truncate text-[11px] text-muted-foreground">{a.shootings.name}</div>
        )}
        {a.shootings?.channel && (
          <span className="mt-0.5 inline-block rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {a.shootings.channel}
          </span>
        )}
      </div>
      <div className="shrink-0 text-right">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            a.present ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive"
          }`}
        >
          {a.present ? "উপস্থিত" : "অনুপস্থিত"}
        </span>
        {a.present && Number(rate) > 0 && (
          <div className="mt-0.5 text-[11px] text-muted-foreground">{taka(Number(rate))}</div>
        )}
      </div>
    </li>
  );
}

function TabBtn({
  active,
  onClick,
  Icon,
  label,
  badge,
  color,
}: {
  active: boolean;
  onClick: () => void;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge: string;
  color: { text: string; bg: string };
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all active:scale-95 ${
        active
          ? `bg-card shadow-sm ${color.text}`
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon className={`h-3.5 w-3.5 ${active ? "" : "opacity-70"}`} />
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] ${
          active ? `${color.bg} ${color.text}` : "bg-muted text-muted-foreground"
        }`}
      >
        {badge}
      </span>
    </button>
  );
}

function ScrollList({ children }: { children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <ul
        className={`divide-y overflow-y-auto ${expanded ? "max-h-[60vh]" : "max-h-64"}`}
      >
        {children}
      </ul>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-center gap-1 rounded-b-2xl border-t bg-muted/30 py-1.5 text-[11px] text-muted-foreground hover:bg-muted/50"
      >
        <ChevronDown className={`h-3 w-3 transition ${expanded ? "rotate-180" : ""}`} />
        {expanded ? "সংক্ষিপ্ত" : "সব দেখুন"}
      </button>
    </>
  );
}
