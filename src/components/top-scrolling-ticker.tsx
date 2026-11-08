import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { taka, bnDate } from "@/lib/format";
import {
  fetchDashboardSummary,
  getCachedDashboardSummary,
} from "@/lib/dashboard-totals";
import {
  fetchClientSummary,
  getCachedClientSummary,
} from "@/lib/client-summary";
import {
  AlertCircle,
  Wallet,
  BadgeDollarSign,
  Clapperboard,
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

const PAYMENTS_CACHE_KEY = "km_cache_recent_payments_v1";
const SHOOTINGS_CACHE_KEY = "km_cache_recent_shootings_v1";

function getCachedPayments(): PaymentRow[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(PAYMENTS_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function getCachedShootings(): ShootingRow[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(SHOOTINGS_CACHE_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function TopScrollingTicker() {
  // Listen for tab focus/visibility to prevent freezing when switching tabs on mobile/tablet
  const [tickerKey, setTickerKey] = useState(0);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        setTickerKey((k) => k + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, []);

  // 1. Total Member Due (Immediate from cache)
  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard"],
    queryFn: fetchDashboardSummary,
    initialData: getCachedDashboardSummary,
    staleTime: 1000 * 60 * 2,
  });

  // 2. Total Client Due (Immediate from cache)
  const { data: clientSummary } = useQuery({
    queryKey: ["client-channel-summary"],
    queryFn: fetchClientSummary,
    initialData: getCachedClientSummary,
    staleTime: 1000 * 60 * 2,
  });

  // 3. Last 3 Payments (Immediate from cache)
  const { data: recentPayments } = useQuery({
    queryKey: ["dashboard-recent-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, paid_at, member:members(name)")
        .order("paid_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      const list = (data ?? []) as unknown as PaymentRow[];
      try {
        localStorage.setItem(PAYMENTS_CACHE_KEY, JSON.stringify(list));
      } catch {
        // ignore
      }
      return list;
    },
    initialData: getCachedPayments,
    staleTime: 1000 * 60 * 2,
  });

  // 4. Last 3 Shootings (Immediate from cache)
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
      const list = (data ?? []) as ShootingRow[];
      try {
        localStorage.setItem(SHOOTINGS_CACHE_KEY, JSON.stringify(list));
      } catch {
        // ignore
      }
      return list;
    },
    initialData: getCachedShootings,
    staleTime: 1000 * 60 * 2,
  });

  const memberDue = dashboardData?.outstanding ?? 0;
  const clientDue = useMemo(() => {
    return (clientSummary ?? []).reduce(
      (acc, row) => acc + Number(row.due ?? 0),
      0,
    );
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

  // Repeat enough items so the loop is always at least 3500px wide, avoiding empty gaps on any tablet or wide screen
  const repeated = useMemo(() => {
    if (items.length === 0) return [];
    const repeatCount = Math.max(3, Math.ceil(18 / items.length));
    const base: TickerItem[] = [];
    for (let i = 0; i < repeatCount; i++) {
      base.push(...items);
    }
    return [...base, ...base];
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="sticky top-0 z-20 flex w-full items-center overflow-hidden border-b border-border/60 bg-background/90 px-3 py-1.5 text-xs shadow-2xs backdrop-blur-md select-none">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-primary">লাইভ আপডেট লোড হচ্ছে…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-20 flex w-full items-center overflow-hidden border-b border-border/60 bg-background/90 text-xs shadow-2xs backdrop-blur-md select-none">
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

      {/* Marquee Track Container with min-w-0 for proper flex shrink calculation on mobile/tablets */}
      <div className="relative min-w-0 flex-1 overflow-hidden py-1">
        {/* Left fade gradient */}
        <div className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-6 bg-gradient-to-r from-background/95 to-transparent sm:w-10" />

        {/* Right fade gradient */}
        <div className="pointer-events-none absolute bottom-0 right-0 top-0 z-10 w-8 bg-gradient-to-l from-background/95 to-transparent sm:w-12" />

        {/* Marquee scrolling strip */}
        <div
          key={tickerKey}
          className="animate-km-marquee flex items-center gap-3 whitespace-nowrap pl-2"
        >
          {repeated.map((item, idx) => {
            const Icon = item.icon;
            return (
              <Link
                key={`${item.id}-${idx}`}
                to={item.to}
                className={`group flex shrink-0 items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all hover:scale-[1.02] sm:text-xs ${item.containerClass}`}
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
                  <span className="text-[10px] opacity-70 sm:text-[11px]">
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
