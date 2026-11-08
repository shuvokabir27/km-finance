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
  ChevronLeft,
  ChevronRight,
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

function useVisibleCount() {
  const [count, setCount] = useState(3);

  useEffect(() => {
    const handleResize = () => {
      const w = window.innerWidth;
      if (w < 540) {
        setCount(1);
      } else if (w < 820) {
        setCount(2);
      } else {
        setCount(3);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return count;
}

export function TopScrollingTicker() {
  const visibleCount = useVisibleCount();
  const [startIndex, setStartIndex] = useState(0);
  const [isSliding, setIsSliding] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Pause when tab is not active / minimized to prevent mobile desync
  useEffect(() => {
    const onVisibility = () => {
      setIsPaused(document.visibilityState === "hidden");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
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
    // 1. Member Due (Rose/Red)
    const memberDueItem: TickerItem = {
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
    };

    // 2. Client Due (Amber/Orange)
    const clientDueItem: TickerItem = {
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
    };

    // 3. Payments (Emerald/Green)
    const paymentItems: TickerItem[] = (recentPayments ?? []).map((p, idx) => ({
      id: `payment-${p.id || idx}`,
      to: "/payments",
      icon: BadgeDollarSign,
      tag: `পেমেন্ট ${idx + 1}`,
      title: p.member?.name || "সদস্য",
      highlight: `৳ ${taka(p.amount)}`,
      subtext: bnDate(p.paid_at),
      containerClass:
        "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 dark:text-emerald-200",
      tagClass: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
      highlightClass: "text-emerald-600 dark:text-emerald-400 font-bold",
    }));

    // 4. Shootings (Sky/Blue)
    const shootingItems: TickerItem[] = (recentShootings ?? []).map((s, idx) => ({
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
    }));

    // Beautifully interleave so consecutive items alternate vibrant colors
    const list: TickerItem[] = [];
    list.push(memberDueItem);
    if (paymentItems[0]) list.push(paymentItems[0]);
    if (shootingItems[0]) list.push(shootingItems[0]);
    list.push(clientDueItem);
    if (paymentItems[1]) list.push(paymentItems[1]);
    if (shootingItems[1]) list.push(shootingItems[1]);
    if (paymentItems[2]) list.push(paymentItems[2]);
    if (shootingItems[2]) list.push(shootingItems[2]);

    return list;
  }, [memberDue, clientDue, recentPayments, recentShootings]);

  // Ensure there are at least 6 items so the sliding window always has continuous items
  const safeItems = useMemo(() => {
    if (items.length === 0) return [];
    let list = [...items];
    while (list.length < 6) {
      list = [...list, ...items];
    }
    return list;
  }, [items]);

  // Chained 3-second step timer: rests for 3000ms, then initiates slide
  useEffect(() => {
    if (isPaused || isHovered || isSliding || safeItems.length === 0) return;

    const timer = setTimeout(() => {
      setIsSliding(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [isPaused, isHovered, isSliding, safeItems.length, startIndex]);

  // Slide completion timer: after 550ms ease-out animation, advance index and reset position
  useEffect(() => {
    if (!isSliding || safeItems.length === 0) return;

    const timer = setTimeout(() => {
      setIsSliding(false);
      setStartIndex((prev) => (prev + 1) % safeItems.length);
    }, 550);

    return () => clearTimeout(timer);
  }, [isSliding, safeItems.length]);

  const handleNext = () => {
    if (isSliding || safeItems.length === 0) return;
    setIsSliding(true);
  };

  const handlePrev = () => {
    if (isSliding || safeItems.length === 0) return;
    setStartIndex((prev) => (prev - 1 + safeItems.length) % safeItems.length);
  };

  // Render visibleCount + 1 items: visibleCount visible, 1 incoming just outside right overflow
  const displayedItems = useMemo(() => {
    if (safeItems.length === 0) return [];
    const list: TickerItem[] = [];
    for (let i = 0; i <= visibleCount; i++) {
      list.push(safeItems[(startIndex + i) % safeItems.length]);
    }
    return list;
  }, [safeItems, startIndex, visibleCount]);

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

  const gap = 10; // px gap between items

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

      {/* Sliding Viewport Container */}
      <div
        className="relative min-w-0 flex-1 overflow-hidden px-2 py-1"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Sliding items track */}
        <div
          className="flex items-center gap-2.5"
          style={{
            transform: isSliding
              ? `translateX(calc(-1 * (100% + ${gap}px) / ${visibleCount}))`
              : "translateX(0px)",
            transition: isSliding
              ? "transform 550ms cubic-bezier(0.25, 1, 0.5, 1)"
              : "none",
          }}
        >
          {displayedItems.map((item, slotIdx) => {
            const Icon = item.icon;
            return (
              <div
                key={slotIdx}
                className="shrink-0"
                style={{
                  width: `calc((100% - ${(visibleCount - 1) * gap}px) / ${visibleCount})`,
                }}
              >
                <Link
                  to={item.to}
                  className={`group flex h-7.5 w-full items-center justify-between gap-1.5 rounded-full border px-2.5 text-[11px] font-medium shadow-2xs transition-all hover:scale-[1.01] sm:text-xs ${item.containerClass}`}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${item.tagClass}`}
                    >
                      <Icon className="h-3 w-3 shrink-0" />
                      <span>{item.tag}</span>
                    </span>

                    <span className="truncate text-foreground/90 font-medium text-[11px] sm:text-xs">
                      {item.title}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1 font-semibold">
                    <span className={item.highlightClass}>{item.highlight}</span>
                    {item.subtext && (
                      <span className="hidden text-[10px] opacity-70 min-[1200px]:inline">
                        • {item.subtext}
                      </span>
                    )}
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manual Step Controls (Prev / Next) */}
      <div className="relative z-10 flex shrink-0 items-center gap-0.5 border-l border-border/60 bg-background/95 px-1.5 py-1">
        <button
          type="button"
          onClick={handlePrev}
          disabled={isSliding}
          title="পূর্ববর্তী তথ্য"
          aria-label="Previous info"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={isSliding}
          title="পরবর্তী তথ্য"
          aria-label="Next info"
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground active:scale-95 disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
