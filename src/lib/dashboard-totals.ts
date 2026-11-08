import { supabase } from "@/integrations/supabase/client";

export type DashboardSummary = {
  paidThisMonth: number;
  outstanding: number;
  prevDue: number;
  currDue: number;
  breakdown: Array<{
    id: string;
    name: string;
    photo_url: string | null;
    prev: number;
    curr: number;
    total: number;
  }>;
};

const STORAGE_KEY = "km_cache_dashboard_summary_v1";

export function getCachedDashboardSummary(): DashboardSummary | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.outstanding === "number") {
      return parsed as DashboardSummary;
    }
  } catch {
    // Ignore cache error
  }
  return undefined;
}

export function saveCachedDashboardSummary(data: DashboardSummary): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota error
  }
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const now = new Date();
  const monthStartDay = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartISO = monthStartDate.toISOString();

  const [membersRes, attRes, salRes, bonRes, payRes, chRes, shRes] = await Promise.all([
    supabase.from("members").select("id, name, photo_url, type, rate"),
    supabase.from("attendance").select("member_id, date, present, rate_override, shooting_id"),
    supabase.from("monthly_salaries").select("member_id, month, amount"),
    supabase.from("bonuses").select("member_id, given_at, amount"),
    supabase.from("payments").select("member_id, paid_at, amount").is("channel_id", null),
    supabase.from("channels").select("name").eq("is_shared", true),
    supabase.from("shootings").select("id, channel"),
  ]);

  const sharedNames = new Set((chRes.data ?? []).map((c: { name: string }) => c.name));
  const sharedShoots = new Set(
    (shRes.data ?? [])
      .filter((s: { channel: string | null }) => s.channel && sharedNames.has(s.channel))
      .map((s: { id: string }) => s.id),
  );

  type M = { id: string; name: string; photo_url: string | null; type: "daily" | "monthly"; rate: number };
  const members = (membersRes.data ?? []) as M[];
  const prev: Record<string, number> = {};
  const curr: Record<string, number> = {};
  for (const m of members) {
    prev[m.id] = 0;
    curr[m.id] = 0;
  }
  const rateOf: Record<string, { type: string; rate: number }> = {};
  members.forEach((m) => {
    rateOf[m.id] = { type: m.type, rate: Number(m.rate) };
  });

  (attRes.data ?? []).forEach((a: { member_id: string; date: string; present: boolean; rate_override: number | null; shooting_id: string | null }) => {
    if (!a.present) return;
    if (a.shooting_id && sharedShoots.has(a.shooting_id)) return;
    const info = rateOf[a.member_id];
    if (!info || info.type !== "daily") return;
    const amt = Number(a.rate_override ?? info.rate);
    if (a.date >= monthStartDay) curr[a.member_id] = (curr[a.member_id] ?? 0) + amt;
    else prev[a.member_id] = (prev[a.member_id] ?? 0) + amt;
  });

  (salRes.data ?? []).forEach((s: { member_id: string; month: string; amount: number }) => {
    const amt = Number(s.amount);
    if (s.month >= monthStartDay) curr[s.member_id] = (curr[s.member_id] ?? 0) + amt;
    else prev[s.member_id] = (prev[s.member_id] ?? 0) + amt;
  });

  (bonRes.data ?? []).forEach((b: { member_id: string; given_at: string; amount: number }) => {
    const amt = Number(b.amount);
    if (b.given_at >= monthStartDay) curr[b.member_id] = (curr[b.member_id] ?? 0) + amt;
    else prev[b.member_id] = (prev[b.member_id] ?? 0) + amt;
  });

  let paidThisMonth = 0;
  (payRes.data ?? []).forEach((p: { member_id: string; paid_at: string; amount: number }) => {
    const amt = Number(p.amount);
    if (p.paid_at >= monthStartISO) {
      curr[p.member_id] = (curr[p.member_id] ?? 0) - amt;
      paidThisMonth += amt;
    } else {
      prev[p.member_id] = (prev[p.member_id] ?? 0) - amt;
    }
  });

  let prevDue = 0;
  let currDue = 0;
  let outstanding = 0;
  const breakdown = members.map((m) => {
    const p = prev[m.id] ?? 0;
    const c = curr[m.id] ?? 0;
    const showPrev = Math.max(0, p + Math.min(0, c));
    const showCurr = Math.max(0, c + Math.min(0, p));
    prevDue += showPrev;
    currDue += showCurr;
    const total = showPrev + showCurr;
    outstanding += total;
    return { id: m.id, name: m.name, photo_url: m.photo_url, prev: showPrev, curr: showCurr, total };
  });

  const result: DashboardSummary = { paidThisMonth, outstanding, prevDue, currDue, breakdown };
  saveCachedDashboardSummary(result);
  return result;
}

