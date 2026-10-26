import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { taka, toBn, bnDate } from "@/lib/format";
import { MemberAvatar } from "@/components/member-avatar";
import { UserSearch, Clapperboard, CalendarCheck, CalendarX, BadgeDollarSign, Wallet, Gift, TrendingUp, Download, Eye, ChevronDown, Check, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMemo } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/account-check")({
  component: AccountCheckPage,
});

async function downloadAccountPDF(el: HTMLElement, fileName: string) {
  const [{ toJpeg }, { default: jsPDF }] = await Promise.all([
    import("html-to-image"),
    import("jspdf"),
  ]);
  const imgData = await toJpeg(el, {
    quality: 0.92,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
  const img = new Image();
  img.src = imgData;
  await new Promise((r) => (img.onload = r));
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const imgW = pageW - margin * 2;
  const imgH = (img.height * imgW) / img.width;
  let heightLeft = imgH;
  let position = margin;
  pdf.addImage(imgData, "JPEG", margin, position, imgW, imgH);
  heightLeft -= pageH - margin * 2;
  while (heightLeft > 0) {
    position = margin - (imgH - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, "JPEG", margin, position, imgW, imgH);
    heightLeft -= pageH - margin * 2;
  }
  pdf.save(fileName);
}

type Member = { id: string; name: string; role: string | null; photo_url: string | null; type: "daily" | "monthly"; rate: number };

function AccountCheckPage() {
  const [memberId, setMemberId] = useState<string>("");
  const [downloading, setDownloading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: members = [] } = useQuery({
    queryKey: ["all-members-simple"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, role, photo_url, type, rate")
        .order("name");
      if (error) throw error;
      return data as Member[];
    },
  });

  const selected = members.find((m) => m.id === memberId) ?? null;

  const { data: stats, isLoading } = useQuery({
    enabled: !!memberId,
    queryKey: ["account-check", memberId],
    queryFn: async () => {
      const [attRes, payRes, bonusRes, msRes, balRes, chRes] = await Promise.all([
        supabase
          .from("attendance")
          .select("present, date, shooting_id, rate_override, shootings(name, shoot_date, location, director, channel)")
          .eq("member_id", memberId)
          .order("date", { ascending: false }),
        supabase
          .from("payments")
          .select("amount, paid_at, note, channel_id")
          .eq("member_id", memberId)
          .order("paid_at", { ascending: false }),
        supabase
          .from("bonuses")
          .select("amount, note, given_at")
          .eq("member_id", memberId)
          .order("given_at", { ascending: false }),
        supabase
          .from("monthly_salaries")
          .select("amount, month")
          .eq("member_id", memberId),
        supabase.rpc("member_balance", { _member_id: memberId }),
        supabase.from("channels").select("id, name").eq("is_shared", true),
      ]);

      const attendance = (attRes.data ?? []) as Array<{
        present: boolean;
        date: string;
        shooting_id: string | null;
        rate_override: number | null;
        shootings: { name: string; shoot_date: string; location: string | null; director: string | null; channel: string | null } | null;
      }>;
      const payments = payRes.data ?? [];
      const bonuses = bonusRes.data ?? [];
      const salaries = msRes.data ?? [];

      const present = attendance.filter((a) => a.present).length;
      const absent = attendance.filter((a) => !a.present).length;
      const shootingIds = new Set(attendance.filter((a) => a.present && a.shooting_id).map((a) => a.shooting_id));

      const member = members.find((m) => m.id === memberId);
      // Share-channel income is settled from the share-channel tab, so it is
      // excluded from the general account totals here.
      const sharedNames = new Set((chRes.data ?? []).map((c: { name: string }) => c.name));
      const isGeneral = (a: (typeof attendance)[number]) =>
        !a.shootings || !sharedNames.has(a.shootings.channel ?? "");
      const generalPresent = attendance.filter((a) => a.present && isGeneral(a));

      let earned = 0;
      if (member?.type === "daily") {
        earned = generalPresent.reduce((s, a) => s + Number(a.rate_override ?? member.rate ?? 0), 0);
      } else {
        earned = salaries.reduce((s, r) => s + Number(r.amount), 0);
      }
      const totalPaid = payments
        .filter((p: { channel_id?: string | null }) => !p.channel_id)
        .reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0);
      const totalBonus = bonuses.reduce((s, b) => s + Number(b.amount), 0);

      const presentAttendance = attendance.filter((a) => a.present);
      const absentAttendance = attendance.filter((a) => !a.present);

      return {
        present,
        absent,
        totalShootings: shootingIds.size,
        totalAttendanceRecords: attendance.length,
        earned,
        totalPaid,
        totalBonus,
        balance: Number(balRes.data ?? 0),
        paymentsCount: payments.length,
        bonusesCount: bonuses.length,
        recentPayments: payments.slice(0, 5),
        recentBonuses: bonuses.slice(0, 5),
        allPayments: payments,
        allBonuses: bonuses,
        presentAttendance,
        absentAttendance,
        generalPresent,
        memberRate: member?.rate ?? 0,
        memberType: member?.type ?? "daily",
      };
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">হিসাব যাচাই</p>
        <h1 className="mt-0.5 text-[22px] font-bold leading-tight">একাউন্ট চেকিং 🔍</h1>
        <p className="mt-1 text-xs text-muted-foreground">সদস্য নির্বাচন করে সম্পূর্ণ হিসাব দেখুন</p>
      </div>

      <div className="rounded-3xl border border-border/70 bg-card p-4">
        <label className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <UserSearch className="h-4 w-4 text-primary" /> সদস্য নির্বাচন করুন
        </label>
        <MemberPicker
          members={members}
          value={memberId}
          onChange={setMemberId}
        />

      </div>

      {!memberId && (
        <div className="rounded-3xl border border-dashed border-border/70 bg-card/40 p-8 text-center text-sm text-muted-foreground">
          একজন সদস্য বাছাই করুন
        </div>
      )}

      {memberId && selected && (
        <>
          <div className="flex items-center gap-3 rounded-3xl border border-border/70 bg-card p-4">
            <MemberAvatar name={selected.name} photoUrl={selected.photo_url} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-bold">{selected.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {selected.role ?? "—"} • {selected.type === "daily" ? "দৈনিক" : "মাসিক"} • রেট {taka(selected.rate)}
              </div>
            </div>
            {stats && (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="flex items-center gap-1.5 rounded-2xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm"
              >
                <Eye className="h-3.5 w-3.5" />
                প্রিভিউ
              </button>
            )}
          </div>

          {isLoading && <div className="py-6 text-center text-xs text-muted-foreground">লোড হচ্ছে…</div>}

          {stats && (
            <>
              <div className="hero-gradient relative overflow-hidden rounded-3xl p-5 shadow-lg">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                <div className="relative">
                  <div className="text-xs text-primary-foreground/80">বর্তমান বকেয়া</div>
                  <div className="mt-1 text-3xl font-black text-primary-foreground">{taka(stats.balance)}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-primary-foreground">
                    <div className="rounded-xl bg-white/15 p-2">
                      <div className="text-[10px] opacity-80">মোট আয়</div>
                      <div className="text-sm font-bold">{taka(stats.earned)}</div>
                    </div>
                    <div className="rounded-xl bg-white/15 p-2">
                      <div className="text-[10px] opacity-80">মোট পরিশোধ</div>
                      <div className="text-sm font-bold">{taka(stats.totalPaid)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <StatCard icon={Clapperboard} label="মোট শুটিং" value={toBn(stats.totalShootings)} tint="primary" />
                <StatCard icon={CalendarCheck} label="মোট হাজিরা" value={toBn(stats.present)} tint="success" />
                <StatCard icon={CalendarX} label="মোট অনুপস্থিত" value={toBn(stats.absent)} tint="destructive" />
                <StatCard icon={Wallet} label="পেমেন্ট সংখ্যা" value={toBn(stats.paymentsCount)} tint="primary" />
                <StatCard icon={Gift} label="মোট বোনাস" value={taka(stats.totalBonus)} tint="success" />
                <StatCard icon={TrendingUp} label="বোনাস সংখ্যা" value={toBn(stats.bonusesCount)} tint="primary" />
              </div>

              <ShootingDues
                items={stats.generalPresent}
                memberType={stats.memberType}
                memberRate={stats.memberRate}
                totalPaid={stats.totalPaid}
              />


              <section className="rounded-3xl border border-border/70 bg-card p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <BadgeDollarSign className="h-4 w-4 text-primary" /> সাম্প্রতিক পেমেন্ট
                </h2>
                {stats.recentPayments.length === 0 && (
                  <div className="py-3 text-center text-xs text-muted-foreground">কোনো পেমেন্ট নেই</div>
                )}
                <ul className="space-y-2">
                  {stats.recentPayments.map((p, i) => (
                    <li key={i} className="flex items-center justify-between rounded-2xl border bg-background p-2.5">
                      <div className="min-w-0">
                        <div className="text-[11px] text-muted-foreground">{bnDate(p.paid_at.slice(0, 10))}</div>
                        {p.note && <div className="truncate text-xs">{p.note}</div>}
                      </div>
                      <div className="text-sm font-bold text-success">{taka(p.amount)}</div>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="rounded-3xl border border-border/70 bg-card p-4">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <Gift className="h-4 w-4 text-primary" /> সাম্প্রতিক বোনাস
                </h2>
                {stats.recentBonuses.length === 0 && (
                  <div className="py-3 text-center text-xs text-muted-foreground">কোনো বোনাস নেই</div>
                )}
                <ul className="space-y-2">
                  {stats.recentBonuses.map((b, i) => (
                    <li key={i} className="flex items-center justify-between rounded-2xl border bg-background p-2.5">
                      <div className="min-w-0">
                        <div className="text-[11px] text-muted-foreground">{bnDate(b.given_at.slice(0, 10))}</div>
                        {b.note && <div className="truncate text-xs">{b.note}</div>}
                      </div>
                      <div className="text-sm font-bold text-primary">{taka(b.amount)}</div>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}

      {/* PDF preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b px-4 py-3">
            <DialogTitle className="text-sm">পিডিএফ প্রিভিউ</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto bg-slate-100 p-3">
            <div
              ref={printRef}
              style={{
                width: "780px",
                margin: "0 auto",
                background: "#ffffff",
                color: "#0f172a",
                padding: "24px",
                fontFamily: "inherit",
              }}
            >
              {selected && stats && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ borderBottom: "2px solid #0f172a", paddingBottom: 12 }}>
                    <div style={{ fontSize: 22, fontWeight: 800 }}>একাউন্ট হিসাব রিপোর্ট</div>
                    <div style={{ fontSize: 12, color: "#475569", marginTop: 4 }}>
                      তারিখ: {bnDate(new Date().toISOString().slice(0, 10))}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, border: "1px solid #e2e8f0", borderRadius: 12 }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{selected.name}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        {selected.role ?? "—"} • {selected.type === "daily" ? "দৈনিক" : "মাসিক"} • রেট {taka(selected.rate)}
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: 16, background: "#0f172a", color: "#ffffff", borderRadius: 12 }}>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>বর্তমান বকেয়া</div>
                    <div style={{ fontSize: 28, fontWeight: 900 }}>{taka(stats.balance)}</div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[
                      ["মোট আয়", taka(stats.earned)],
                      ["মোট পরিশোধ", taka(stats.totalPaid)],
                      ["মোট বোনাস", taka(stats.totalBonus)],
                      ["মোট শুটিং", toBn(stats.totalShootings)],
                      ["মোট হাজিরা", toBn(stats.present)],
                      ["মোট অনুপস্থিত", toBn(stats.absent)],
                      ["পেমেন্ট সংখ্যা", toBn(stats.paymentsCount)],
                      ["বোনাস সংখ্যা", toBn(stats.bonusesCount)],
                    ].map(([l, v]) => (
                      <div key={l} style={{ padding: 10, border: "1px solid #e2e8f0", borderRadius: 10 }}>
                        <div style={{ fontSize: 10, color: "#64748b" }}>{l}</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{v}</div>
                      </div>
                    ))}
                  </div>

                  <PrintTable
                    title={`উপস্থিত শুটিং তালিকা (${toBn(stats.presentAttendance.length)})`}
                    headers={["তারিখ", "শুটিং", "চ্যানেল / পরিচালক", "লোকেশন", "পরিমাণ"]}
                    rightCols={[4]}
                    empty="কোনো উপস্থিতি নেই"
                    rows={stats.presentAttendance.map((a) => [
                      bnDate(a.date),
                      a.shootings?.name ?? "—",
                      [a.shootings?.channel, a.shootings?.director].filter(Boolean).join(" / ") || "—",
                      a.shootings?.location ?? "—",
                      stats.memberType === "daily"
                        ? taka(Number(a.rate_override ?? stats.memberRate))
                        : "—",
                    ])}
                  />

                  <PrintTable
                    title={`অনুপস্থিত তালিকা (${toBn(stats.absentAttendance.length)})`}
                    headers={["তারিখ", "শুটিং", "চ্যানেল / পরিচালক", "লোকেশন"]}
                    empty="কোনো অনুপস্থিতি নেই"
                    rows={stats.absentAttendance.map((a) => [
                      bnDate(a.date),
                      a.shootings?.name ?? "—",
                      [a.shootings?.channel, a.shootings?.director].filter(Boolean).join(" / ") || "—",
                      a.shootings?.location ?? "—",
                    ])}
                  />

                  <PrintTable
                    title={`সকল পেমেন্ট (${toBn(stats.allPayments.length)})`}
                    headers={["তারিখ", "নোট", "পরিমাণ"]}
                    rightCols={[2]}
                    empty="কোনো পেমেন্ট নেই"
                    rows={stats.allPayments.map((p) => [
                      bnDate(p.paid_at.slice(0, 10)),
                      p.note ?? "—",
                      taka(p.amount),
                    ])}
                  />

                  <PrintTable
                    title={`সকল বোনাস (${toBn(stats.allBonuses.length)})`}
                    headers={["তারিখ", "নোট", "পরিমাণ"]}
                    rightCols={[2]}
                    empty="কোনো বোনাস নেই"
                    rows={stats.allBonuses.map((b) => [
                      bnDate(b.given_at.slice(0, 10)),
                      b.note ?? "—",
                      taka(b.amount),
                    ])}
                  />
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="border-t px-4 py-3">
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              className="rounded-2xl border px-3 py-2 text-xs font-semibold"
            >
              বাতিল
            </button>
            <button
              type="button"
              disabled={downloading}
              onClick={async () => {
                if (!printRef.current || !selected) return;
                try {
                  setDownloading(true);
                  await downloadAccountPDF(printRef.current, `${selected.name}-হিসাব.pdf`);
                  setPreviewOpen(false);
                } catch (e) {
                  console.error(e);
                  toast.error("পিডিএফ তৈরিতে সমস্যা হয়েছে");
                } finally {
                  setDownloading(false);
                }
              }}
              className="flex items-center gap-1.5 rounded-2xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              {downloading ? "তৈরি হচ্ছে…" : "ডাউনলোড"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type AttItem = {
  present: boolean;
  date: string;
  shooting_id: string | null;
  rate_override: number | null;
  shootings: { name: string; shoot_date: string; location: string | null; director: string | null; channel: string | null } | null;
};

function ShootingDues({
  items,
  memberType,
  memberRate,
  totalPaid,
}: {
  items: AttItem[];
  memberType: "daily" | "monthly";
  memberRate: number;
  totalPaid: number;
}) {
  const rows = useMemo(() => {
    if (memberType !== "daily") return [];
    const asc = [...items]
      .filter((a) => a.shooting_id && a.present)
      .sort((a, b) => a.date.localeCompare(b.date));
    let remaining = totalPaid;
    const out = asc.map((a) => {
      const amount = Number(a.rate_override ?? memberRate ?? 0);
      const paid = Math.min(remaining, amount);
      remaining -= paid;
      return {
        key: `${a.shooting_id}-${a.date}`,
        name: a.shootings?.name ?? "শুটিং",
        date: a.date,
        channel: a.shootings?.channel ?? null,
        amount,
        paid,
        due: amount - paid,
      };
    });
    return out.reverse();
  }, [items, memberType, memberRate, totalPaid]);

  if (memberType !== "daily") return null;

  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const thisMonth = rows.filter((r) => r.date.slice(0, 7) === monthPrefix);
  const previous = rows.filter((r) => r.date.slice(0, 7) < monthPrefix);
  const sum = (arr: typeof rows, k: "amount" | "due") => arr.reduce((s, r) => s + r[k], 0);

  const totalDue = sum(rows, "due");
  const dueCount = rows.filter((r) => r.due > 0).length;

  return (
    <section className="rounded-3xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Clapperboard className="h-4 w-4 text-primary" /> শুটিং অনুযায়ী বকেয়া
        </h2>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          {toBn(dueCount)} টি বাকি • {taka(totalDue)}
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-muted/40 p-3">
          <div className="text-[10px] text-muted-foreground">এই মাসের উপস্থিত শুটিং</div>
          <div className="text-lg font-bold">{toBn(thisMonth.length)} টি</div>
          <div className="text-[11px] text-muted-foreground">
            আয় {taka(sum(thisMonth, "amount"))} • বাকি {taka(sum(thisMonth, "due"))}
          </div>
        </div>
        <div className="rounded-2xl bg-muted/40 p-3">
          <div className="text-[10px] text-muted-foreground">পূর্বের মোট শুটিং</div>
          <div className="text-lg font-bold">{toBn(previous.length)} টি</div>
          <div className="text-[11px] text-muted-foreground">
            আয় {taka(sum(previous, "amount"))} • বাকি {taka(sum(previous, "due"))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-3 text-center text-xs text-muted-foreground">কোনো শুটিং নেই</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-2 rounded-2xl border bg-background p-2.5">
              <div className="min-w-0">
                <div className="truncate text-xs font-medium">{r.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {bnDate(r.date)}
                  {r.channel ? ` • ${r.channel}` : ""}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[10px] text-muted-foreground">{taka(r.amount)}</div>
                {r.due > 0 ? (
                  <div className="text-sm font-bold text-destructive">বাকি {taka(r.due)}</div>
                ) : (
                  <div className="text-sm font-bold text-success">পরিশোধিত</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

    </section>
  );
}


function PrintTable({
  title,
  headers,
  rows,
  empty,
  rightCols = [],
}: {
  title: string;
  headers: string[];
  rows: (string | number)[][];
  empty: string;
  rightCols?: number[];
}) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{title}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: "#f1f5f9" }}>
            {headers.map((h, i) => (
              <th
                key={i}
                style={{
                  textAlign: rightCols.includes(i) ? "right" : "left",
                  padding: 6,
                  border: "1px solid #e2e8f0",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={headers.length} style={{ padding: 8, textAlign: "center", color: "#64748b", border: "1px solid #e2e8f0" }}>
                {empty}
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td
                  key={j}
                  style={{
                    padding: 6,
                    border: "1px solid #e2e8f0",
                    textAlign: rightCols.includes(j) ? "right" : "left",
                    fontWeight: rightCols.includes(j) ? 700 : 400,
                  }}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tint: "primary" | "success" | "destructive";
}) {
  const tintMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
  };
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-3">
      <span className={`mb-2 inline-grid h-9 w-9 place-items-center rounded-xl ${tintMap[tint]}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}

type PickerMember = { id: string; name: string; role: string | null; photo_url: string | null };

function MemberPicker({ members, value, onChange }: { members: PickerMember[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = members.find((m) => m.id === value) ?? null;
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return members;
    return members.filter((m) => m.name.toLowerCase().includes(s) || (m.role ?? "").toLowerCase().includes(s));
  }, [members, q]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-2xl border bg-background px-3 py-2 text-left text-sm"
        >
          {selected ? (
            <>
              <MemberAvatar name={selected.name} photoUrl={selected.photo_url} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{selected.name}</div>
                {selected.role && <div className="truncate text-[11px] text-muted-foreground">{selected.role}</div>}
              </div>
            </>
          ) : (
            <span className="flex-1 text-muted-foreground">-- সদস্য বাছাই করুন --</span>
          )}
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="খুঁজুন…"
            className="w-full bg-transparent text-sm outline-none"
            autoFocus
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">কোনো সদস্য নেই</div>
          )}
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onChange(m.id); setOpen(false); setQ(""); }}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <MemberAvatar name={m.name} photoUrl={m.photo_url} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.name}</div>
                {m.role && <div className="truncate text-[11px] text-muted-foreground">{m.role}</div>}
              </div>
              {value === m.id && <Check className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
