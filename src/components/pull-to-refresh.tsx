import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 70;
const MAX_PULL = 120;

export function PullToRefresh() {
  const router = useRouter();
  const qc = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) return;
      startY.current = e.touches[0].clientY;
      active.current = true;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!active.current || startY.current === null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { setPull(0); return; }
      // dampen
      const eased = Math.min(MAX_PULL, dy * 0.5);
      setPull(eased);
    };
    const onTouchEnd = async () => {
      if (!active.current) return;
      active.current = false;
      startY.current = null;
      if (pull >= THRESHOLD && !refreshing) {
        setRefreshing(true);
        setPull(THRESHOLD);
        try {
          await Promise.all([
            router.invalidate(),
            qc.invalidateQueries(),
          ]);
        } finally {
          setTimeout(() => {
            setRefreshing(false);
            setPull(0);
          }, 300);
        }
      } else {
        setPull(0);
      }
    };
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [pull, refreshing, router, qc]);

  const progress = Math.min(1, pull / THRESHOLD);
  const visible = pull > 0 || refreshing;

  return (
    <div
      aria-hidden={!visible}
      className="pointer-events-none fixed left-0 right-0 top-0 z-50 flex justify-center"
      style={{
        transform: `translateY(${Math.max(0, pull - 40)}px)`,
        opacity: visible ? 1 : 0,
        transition: active.current ? "none" : "transform 200ms ease, opacity 200ms ease",
      }}
    >
      <div
        className="mt-2 grid h-10 w-10 place-items-center rounded-full border bg-card shadow-md"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <RefreshCw
          className={`h-5 w-5 text-primary ${refreshing ? "animate-spin" : ""}`}
          style={{ transform: refreshing ? undefined : `rotate(${progress * 270}deg)` }}
        />
      </div>
    </div>
  );
}
