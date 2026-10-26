import { createServerFn } from "@tanstack/react-start";

export type ReportShooting = {
  id: string;
  name: string;
  shoot_date: string;
  location: string | null;
  director: string | null;
  attendance: number;
  extra: number;
  present: number;
};
export type ReportIncome = { id: string; source: string; amount: number; earned_at: string; note: string | null };
export type ReportMember = { name: string; role: string | null; days: number; earned: number };
export type ReportExpenseGroup = { label: string; count: number; amount: number };
export type SharedReport = {
  channel_name: string;
  logo_url: string | null;
  range: { from: string | null; to: string | null };
  shooting_name: string | null;
  created_at: string;
  income_total: number;
  attendance_total: number;
  extra_total: number;
  net: number;
  incomes: ReportIncome[];
  shootings: ReportShooting[];
  members: ReportMember[];
  extras: ReportExpenseGroup[];
  partners: { name: string; percent: number; share: number }[];
};

function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const getSharedReport = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string; token: string }) => {
    if (!d?.id || !/^[0-9a-f-]{36}$/i.test(d.id)) throw new Error("লিংকটি সঠিক নয়");
    return { id: d.id, token: typeof d.token === "string" ? d.token.slice(0, 100) : "" };
  })
  .handler(async ({ data }): Promise<SharedReport> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: r } = await db.from("shared_channel_reports").select("*").eq("id", data.id).maybeSingle();
    if (!r || !data.token || !safeEq(data.token, r.token)) throw new Error("অবৈধ লিংক");
    const { data: ch } = await db.from("channels").select("id,name,owner_id,logo_url").eq("id", r.channel_id).maybeSingle();
    if (!ch) throw new Error("চ্যানেল পাওয়া যায়নি");
    const from = r.date_from as string | null;
    const to = r.date_to as string | null;

    let sq = db.from("shootings").select("id,name,shoot_date,location,director")
      .eq("owner_id", ch.owner_id).eq("channel", ch.name).order("shoot_date", { ascending: false });
    if (from) sq = sq.gte("shoot_date", from);
    if (to) sq = sq.lte("shoot_date", to);
    if (r.shooting_id) sq = sq.eq("id", r.shooting_id);
    const shoots = (await sq).data ?? [];
    const ids = shoots.map((s) => s.id);

    let iq = db.from("channel_incomes").select("id,source,amount,earned_at,note,shooting_id")
      .eq("channel_id", ch.id).order("earned_at", { ascending: false });
    if (from) iq = iq.gte("earned_at", from);
    if (to) iq = iq.lte("earned_at", to);
    if (r.shooting_id) iq = iq.eq("shooting_id", r.shooting_id);
    const incomes = ((await iq).data ?? []).map((i) => ({
      id: i.id, source: i.source, amount: Number(i.amount), earned_at: i.earned_at, note: i.note,
    }));

    const att = ids.length
      ? (await db.from("attendance").select("shooting_id,member_id,rate_override,members(name,role,type,rate)")
          .in("shooting_id", ids).eq("present", true)).data ?? []
      : [];
    const exps = ids.length
      ? (await db.from("shooting_expenses").select("shooting_id,amount,note").in("shooting_id", ids)).data ?? []
      : [];

    const perShoot = new Map<string, { a: number; e: number; p: number }>();
    const mem = new Map<string, ReportMember>();
    for (const a of att as any[]) {
      const m = a.members;
      if (!m || m.type !== "daily") continue;
      const amt = Number(a.rate_override ?? m.rate);
      const s = perShoot.get(a.shooting_id) ?? { a: 0, e: 0, p: 0 };
      s.a += amt; s.p += 1; perShoot.set(a.shooting_id, s);
      const cur = mem.get(a.member_id) ?? { name: m.name, role: m.role, days: 0, earned: 0 };
      cur.days += 1; cur.earned += amt; mem.set(a.member_id, cur);
    }
    const ex = new Map<string, ReportExpenseGroup>();
    for (const e of exps) {
      const s = perShoot.get(e.shooting_id) ?? { a: 0, e: 0, p: 0 };
      s.e += Number(e.amount); perShoot.set(e.shooting_id, s);
      const label = e.note?.trim() || "অন্যান্য";
      const g = ex.get(label) ?? { label, count: 0, amount: 0 };
      g.count += 1; g.amount += Number(e.amount); ex.set(label, g);
    }
    const shootings = shoots.map((s) => {
      const v = perShoot.get(s.id) ?? { a: 0, e: 0, p: 0 };
      return { ...s, attendance: v.a, extra: v.e, present: v.p };
    });
    const income_total = incomes.reduce((a, i) => a + i.amount, 0);
    const attendance_total = shootings.reduce((a, s) => a + s.attendance, 0);
    const extra_total = shootings.reduce((a, s) => a + s.extra, 0);
    const net = income_total - attendance_total - extra_total;
    const parts = (await db.from("channel_partners").select("partner_name,share_percent").eq("channel_id", ch.id)).data ?? [];

    return {
      channel_name: ch.name,
      logo_url: ch.logo_url ?? null,
      range: { from, to },
      shooting_name: r.shooting_id ? shoots[0]?.name ?? null : null,
      created_at: r.created_at,
      income_total, attendance_total, extra_total, net,
      incomes, shootings,
      members: [...mem.values()].sort((a, b) => b.earned - a.earned),
      extras: [...ex.values()].sort((a, b) => b.amount - a.amount),
      partners: parts.map((p) => ({
        name: p.partner_name,
        percent: Number(p.share_percent),
        share: Math.round(Math.max(net, 0) * Number(p.share_percent)) / 100,
      })),
    };
  });
