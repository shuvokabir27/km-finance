import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { taka, bnDate } from "@/lib/format";
import { fetchDashboardSummary } from "@/lib/dashboard-totals";
import {
  AlertCircle,
  Wallet,
  BadgeDollarSign,
  Clapperboard,
  Sparkles,
} from "lucide-react";

type ShootingRow = {
  id: string;
  name: string;
  shoot_date: string;
};

type PaymentRow = {
  id: string;
  amount: number;
  paid_at: string;
  member: { name: string } | null;
};

type TickerItem = {
  id: string;
  to: string;
  icon: typeof AlertCircle;
  tag: string;
  title: string;
  highlight: string;
  subtext?: string;
  containerClass: string;
  tagClass: string;
  highlightClass: string;
};

export function TopScrollingTicker() {
  // 1. Total Member Due
  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardSummary,
    staleTime: 1000 * 60,
  });

  // 2. Total Client Due
  const { data: clientSummary } = useQuery({
    queryKey: ["client-channel-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_channel_summary");
      if (error) throw error;
      return (data ?? []) as Array<{ due_total: number }>;
    },
    staleTime: 1000 * 60,
  });

  // 3. Last 3 Payments
  const { data: recentPayments } = useQuery({
    queryKey: ["dashboard-recent-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, paid_at, member:members(name)")
        .order("paid_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data as unknown as PaymentRow[];
    },
    staleTime: 1000 * 60,
  });

  // 4. Last 3 Shootings
  const { data: recentShootings } = useQuery({
    queryKey: ["dashboard-recent-shootings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date")
        .order("shoot_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data as ShootingRow[];
    },
    staleTime: 1000 * 60,
  });

  const memberDue = dashboardData?.outstanding ?? 0;
  const clientDue = useMemo(() => {
    return (clientSummary ?? []).reduce((acc, row) => acc + Number(row.due_total ?? 0), 0);
  }, [clientSummary]);

  // Construct alternating colorful ticker items
  const items: TickerItem[] = useMemo(() => {
    const list: TickerItem[] = [];

    // 1. Member Due (Rose/Red)
    list.push({
      id: "member-due",
      to: "/members",
      icon: AlertCircle,
      tag: "সদস্য বকেয়া",
      title: "মোট বকেয়া",
      highlight: `৳ ${taka(memberDue)}`,
      containerClass:
        "border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-800 dark:text-rose-200",
      tagClass: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
      highlightClass: "text-rose-600 dark:text-rose-400 font-bold",
    });

    // 2. Client Due (Amber/Orange)
    list.push({
      id: "client-due",
      to: "/client-dues",
      icon: Wallet,
      tag: "ক্লায়েন্ট বকেয়া",
      title: "মোট বাকি",
      highlight: `৳ ${taka(clientDue)}`,
      containerClass:
        "border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-amber-200",
      tagClass: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
      highlightClass: "text-amber-600 dark:text-amber-400 font-bold",
    });

    // 3. Payments (Emerald/Green)
    (recentPayments ?? []).forEach((p, idx) => {
      const name = p.member?.name || "সদস্য";
      list.push({
        id: `payment-${p.id || idx}`,
        to: "/payments",
        icon: BadgeDollarSign,
        tag: `পেমেন্ট ${idx + 1}`,
        title: name,
        highlight: `৳ ${taka(p.amount)}`,
        subtext: bnDate(p.paid_at),
        containerClass:
          "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200",
        tagClass: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
        highlightClass: "text-emerald-600 dark:text-emerald-400 font-bold",
      });
    });

    // 4. Shootings (Sky/Blue)
    (recentShootings ?? []).forEach((s, idx) => {
      list.push({
        id: `shooting-${s.id || idx}`,
        to: "/shootings",
        icon: Clapperboard,
        tag: `শুটিং ${idx + 1}`,
        title: s.name,
        highlight: bnDate(s.shoot_date),
        containerClass:
          "border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-800 dark:text-sky-200",
        tagClass: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
        highlightClass: "text-sky-600 dark:text-sky-400 font-semibold",
      });
    });

    return list;
  }, [memberDue, clientDue, recentPayments, recentShootings]);

  if (items.length === 0) return null;

  // We repeat items 4 times so it loops seamlessly on wide screens without empty gaps
  const repeated = [...items, ...items, ...items, ...items];

  return (
    <div className="sticky top-0 z-20 flex w-full items-center overflow-hidden border-b border-border/60 bg-background/90 backdrop-blur-md text-xs shadow-2xs select-none">
      {/* Left fixed live indicator */}
      <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-r border-border/60 bg-background/95 px-3 py-1.5 shadow-[4px_0_12px_-2px_rgba(0,0,0,0.06)] dark:shadow-[4px_0_12px_-2px_rgba(0,0,0,0.3)]">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
        </span>
        <span className="hidden font-bold tracking-tight text-primary sm:inline">
          লাইভ আপডেট
        </span>
        <span className="font-bold tracking-tight text-primary sm:hidden">
          আপডেট
        </span>
      </div>

      {/* Marquee Track Container */}
      <div className="relative flex-1 overflow-hidden py-1">
        {/* Left fade gradient */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-6 bg-gradient-to-r from-background/95 to-transparent sm:w-10" />

        {/* Right fade gradient */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-8 bg-gradient-to-l from-background/95 to-transparent sm:w-12" />

        {/* Marquee scrolling strip */}
        <div className="animate-km-marquee flex items-center gap-3 whitespace-nowrap pl-2">
          {repeated.map((item, idx) => {
            const Icon = item.icon;
            return (
              <Link
                key={`${item.id}-${idx}`}
                to={item.to}
                className={`group flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] sm:text-xs font-medium transition-all hover:scale-[1.02] ${item.containerClass}`}
              >
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${item.tagClass}`}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  {item.tag}
                </span>

                <span className="max-w-[140px] truncate sm:max-w-[180px]">
                  {item.title}
                </span>

                <span className={item.highlightClass}>{item.highlight}</span>

                {item.subtext && (
                  <span className="opacity-70 text-[10px] sm:text-[11px]">
                    • {item.subtext}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
