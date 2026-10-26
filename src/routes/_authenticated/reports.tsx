import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { taka, bnDate, toBn } from "@/lib/format";
import { Download, FileText, Filter } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

type Member = { id: string; name: string; type: "daily" | "monthly"; rate: number };
type Shooting = { id: string; name: string; shoot_date: string; director: string | null; channel: string | null };
type Attendance = { id: string; member_id: string; date: string; present: boolean; shooting_id: string | null; rate_override: number | null };
type Payment = { id: string; member_id: string; amount: number; note: string | null; paid_at: string };
type Bonus = { id: string; member_id: string; amount: number; note: string | null; given_at: string };
type Expense = { id: string; shooting_id: string; amount: number; note: string | null; spent_at: string };
type MonthlySalary = { id: string; member_id: string; month: string; amount: number };

function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [shootingIds, setShootingIds] = useState<string[]>([]);
  const [generated, setGenerated] = useState(false);

  const { data: members = [] } = useQuery({
    queryKey: ["report-members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("members").select("id, name, type, rate").order("name");
      if (error) throw error;
      return data as Member[];
    },
  });

  const { data: shootings = [] } = useQuery({
    queryKey: ["report-shootings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("shootings").select("id, name, shoot_date, director, channel").order("shoot_date", { ascending: false });
      if (error) throw error;
      return data as Shooting[];
    },
  });

  const filters = useMemo(() => ({ from, to, memberIds, shootingIds }), [from, to, memberIds, shootingIds]);

  const report = useQuery({
    queryKey: ["report-data", filters, generated],
    enabled: generated,
    queryFn: async () => {
      const toEnd = `${to}T23:59:59`;
      // Only present attendance rows
      let attQ = supabase.from("attendance").select("*").gte("date", from).lte("date", to).eq("present", true);
      let payQ = supabase.from("payments").select("*").gte("paid_at", from).lte("paid_at", toEnd);
      let bonQ = supabase.from("bonuses").select("*").gte("given_at", from).lte("given_at", toEnd);
      let expQ = supabase.from("shooting_expenses").select("*").gte("spent_at", from).lte("spent_at", toEnd);
      let salQ = supabase.from("monthly_salaries").select("*").gte("month", from).lte("month", to);
      if (memberIds.length) {
        attQ = attQ.in("member_id", memberIds);
        payQ = payQ.in("member_id", memberIds);
        bonQ = bonQ.in("member_id", memberIds);
        salQ = salQ.in("member_id", memberIds);
      }
      if (shootingIds.length) {
        attQ = attQ.in("shooting_id", shootingIds);
        expQ = expQ.in("shooting_id", shootingIds);
      }
      const [att, pay, bon, exp, sal] = await Promise.all([attQ, payQ, bonQ, expQ, salQ]);
      return {
        attendance: (att.data ?? []) as Attendance[],
        payments: (pay.data ?? []) as Payment[],
        bonuses: (bon.data ?? []) as Bonus[],
        expenses: (exp.data ?? []) as Expense[],
        salaries: (sal.data ?? []) as MonthlySalary[],
      };
    },
  });

  const memberMap = useMemo(() => Object.fromEntries(members.map((m) => [m.id, m])), [members]);
  const shootingMap = useMemo(() => Object.fromEntries(shootings.map((s) => [s.id, s])), [shootings]);

  const toggle = (arr: string[], id: string, set: (v: string[]) => void) => {
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  };

  // Group everything by member
  const perMember = useMemo(() => {
    if (!report.data) return [];
    const targetMembers = memberIds.length ? members.filter((m) => memberIds.includes(m.id)) : members;
    return targetMembers.map((m) => {
      const att = report.data!.attendance.filter((a) => a.member_id === m.id);
      const sal = report.data!.salaries.filter((s) => s.member_id === m.id);
      const pay = report.data!.payments.filter((p) => p.member_id === m.id);
      const bon = report.data!.bonuses.filter((b) => b.member_id === m.id);
      const attEarned = att.reduce((s, a) => s + Number(a.rate_override ?? m.rate ?? 0), 0);
      const salEarned = sal.reduce((s, x) => s + Number(x.amount), 0);
      const earned = m.type === "daily" ? attEarned : salEarned;
      const bonus = bon.reduce((s, b) => s + Number(b.amount), 0);
      const paid = pay.reduce((s, p) => s + Number(p.amount), 0);
      const balance = earned + bonus - paid;
      return { member: m, att, sal, pay, bon, earned, bonus, paid, balance };
    }).filter((g) => g.att.length || g.sal.length || g.pay.length || g.bon.length);
  }, [report.data, members, memberIds]);

  const totals = useMemo(() => {
    const earned = perMember.reduce((s, g) => s + g.earned, 0);
    const bonus = perMember.reduce((s, g) => s + g.bonus, 0);
    const paid = perMember.reduce((s, g) => s + g.paid, 0);
    const expTotal = report.data?.expenses.reduce((s, e) => s + Number(e.amount), 0) ?? 0;
    return { earned, bonus, paid, balance: earned + bonus - paid, expTotal };
  }, [perMember, report.data]);

  const handleDownload = () => window.print();

  return (
    <div className="space-y-4">
      <div className="no-print">
        <h1 className="text-2xl font-bold">রিপোর্ট ও PDF</h1>
        <p className="text-sm text-muted-foreground">ফিল্টার করে সকল হিসাব PDF ডাউনলোড করুন</p>
      </div>

      {/* Filters */}
      <div className="no-print space-y-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Filter className="h-4 w-4 text-primary" /> ফিল্টার
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">শুরুর তারিখ</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">শেষ তারিখ</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">সদস্য ({toBn(memberIds.length)} নির্বাচিত)</Label>
            <button
              className="text-xs text-primary"
              type="button"
              onClick={() => setMemberIds(memberIds.length === members.length ? [] : members.map((m) => m.id))}
            >
              {memberIds.length === members.length ? "ক্লিয়ার" : "সব"}
            </button>
          </div>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border bg-background p-2">
            {members.map((m) => {
              const on = memberIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(memberIds, m.id, setMemberIds)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {m.name}
                </button>
              );
            })}
            {members.length === 0 && <span className="text-xs text-muted-foreground">কোনো সদস্য নেই</span>}
          </div>
          <p className="text-[10px] text-muted-foreground">কাউকে নির্বাচন না করলে সবার রিপোর্ট আসবে</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">শুটিং ({toBn(shootingIds.length)} নির্বাচিত)</Label>
            <button
              className="text-xs text-primary"
              type="button"
              onClick={() => setShootingIds(shootingIds.length === shootings.length ? [] : shootings.map((s) => s.id))}
            >
              {shootingIds.length === shootings.length ? "ক্লিয়ার" : "সব"}
            </button>
          </div>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border bg-background p-2">
            {shootings.map((s) => {
              const on = shootingIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(shootingIds, s.id, setShootingIds)}
                  className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "bg-muted"}`}
                >
                  {s.name}
                </button>
              );
            })}
            {shootings.length === 0 && <span className="text-xs text-muted-foreground">কোনো শুটিং নেই</span>}
          </div>
          <p className="text-[10px] text-muted-foreground">খালি রাখলে সব শুটিং অন্তর্ভুক্ত হবে</p>
        </div>

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" onClick={() => setGenerated(true)} disabled={report.isFetching}>
            <FileText className="h-4 w-4" /> প্রিভিউ তৈরি করুন
          </Button>
          <Button variant="outline" onClick={handleDownload} disabled={!report.data}>
            <Download className="h-4 w-4" /> PDF
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          টিপ: PDF বাটনে ক্লিক করলে প্রিন্ট ডায়লগ খুলবে। সেখান থেকে "Save as PDF" নির্বাচন করুন।
        </p>
      </div>

      {/* Print area */}
      {generated && report.data && (
        <div id="print-area" className="space-y-5 rounded-2xl border bg-card p-5 text-sm">
          <div className="border-b pb-3 text-center">
            <h2 className="text-xl font-bold">Kuakata Multimedia Finance — সমন্বিত হিসাব রিপোর্ট</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              সময়কাল: {bnDate(from)} — {bnDate(to)}
            </p>
            {shootingIds.length > 0 && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                শুটিং: {shootingIds.map((id) => shootingMap[id]?.name).filter(Boolean).join(", ")}
              </p>
            )}
          </div>

          {/* Summary */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <SummaryBox label="মোট আয়" value={taka(totals.earned)} />
            <SummaryBox label="বোনাস" value={taka(totals.bonus)} />
            <SummaryBox label="পরিশোধ" value={taka(totals.paid)} />
            <SummaryBox label="বকেয়া" value={taka(totals.balance)} />
            <SummaryBox label="শুটিং খরচ" value={taka(totals.expTotal)} />
          </div>

          {/* Per-member sections */}
          {perMember.length === 0 && <Empty />}
          {perMember.map((g) => (
            <section key={g.member.id} className="rounded-xl border p-3 break-inside-avoid">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-1.5">
                <div>
                  <div className="text-base font-bold">{g.member.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {g.member.type === "daily" ? "দৈনিক" : "মাসিক"} • রেট {taka(g.member.rate)}
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 text-[11px]">
                  <Mini label="আয়" value={taka(g.earned)} />
                  <Mini label="বোনাস" value={taka(g.bonus)} />
                  <Mini label="পরিশোধ" value={taka(g.paid)} />
                  <Mini label="বকেয়া" value={taka(g.balance)} highlight />
                </div>
              </div>

              {/* Daily attendance — only present rows already filtered */}
              {g.member.type === "daily" && g.att.length > 0 && (
                <SubSection title={`উপস্থিত শুটিং (${toBn(g.att.length)})`}>
                  <ReportTable
                    headers={["তারিখ", "শুটিং", "রেট"]}
                    rows={[...g.att]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((a) => [
                        bnDate(a.date),
                        a.shooting_id ? shootingMap[a.shooting_id]?.name ?? "—" : "—",
                        taka(Number(a.rate_override ?? g.member.rate ?? 0)),
                      ])}
                  />
                </SubSection>
              )}

              {/* Monthly salaries */}
              {g.member.type === "monthly" && g.sal.length > 0 && (
                <SubSection title={`মাসিক বেতন (${toBn(g.sal.length)})`}>
                  <ReportTable
                    headers={["মাস", "পরিমাণ"]}
                    rows={[...g.sal]
                      .sort((a, b) => a.month.localeCompare(b.month))
                      .map((s) => [bnDate(s.month), taka(s.amount)])}
                  />
                </SubSection>
              )}

              {g.bon.length > 0 && (
                <SubSection title={`বোনাস (${toBn(g.bon.length)})`}>
                  <ReportTable
                    headers={["তারিখ", "নোট", "পরিমাণ"]}
                    rows={[...g.bon]
                      .sort((a, b) => a.given_at.localeCompare(b.given_at))
                      .map((b) => [bnDate(b.given_at.slice(0, 10)), b.note || "—", taka(b.amount)])}
                  />
                </SubSection>
              )}

              {g.pay.length > 0 && (
                <SubSection title={`পরিশোধ (${toBn(g.pay.length)})`}>
                  <ReportTable
                    headers={["তারিখ", "নোট", "পরিমাণ"]}
                    rows={[...g.pay]
                      .sort((a, b) => a.paid_at.localeCompare(b.paid_at))
                      .map((p) => [bnDate(p.paid_at.slice(0, 10)), p.note || "—", taka(p.amount)])}
                  />
                </SubSection>
              )}
            </section>
          ))}

          {/* Shooting expenses (overall) */}
          {report.data.expenses.length > 0 && (
            <section className="rounded-xl border p-3 break-inside-avoid">
              <h3 className="mb-1.5 border-b pb-1 text-sm font-bold">
                শুটিং খরচ ({toBn(report.data.expenses.length)} রেকর্ড)
              </h3>
              <ReportTable
                headers={["তারিখ", "শুটিং", "নোট", "পরিমাণ"]}
                rows={[...report.data.expenses]
                  .sort((a, b) => a.spent_at.localeCompare(b.spent_at))
                  .map((e) => [
                    bnDate(e.spent_at.slice(0, 10)),
                    shootingMap[e.shooting_id]?.name ?? "—",
                    e.note || "—",
                    taka(e.amount),
                  ])}
              />
            </section>
          )}

          <div className="border-t pt-2 text-center text-[10px] text-muted-foreground">
            রিপোর্ট তৈরি: {bnDate(new Date())} • Kuakata Multimedia Finance
          </div>
        </div>
      )}

      {report.isFetching && <div className="py-6 text-center text-sm text-muted-foreground">লোড হচ্ছে…</div>}
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/40 p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold text-primary">{value}</div>
    </div>
  );
}

function Mini({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-2 py-1 text-center ${highlight ? "border-primary/40 bg-primary/10" : "bg-muted/40"}`}>
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className={`text-[11px] font-bold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-2">
      <div className="mb-1 text-[11px] font-semibold text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Empty() {
  return <div className="py-6 text-center text-xs text-muted-foreground">কোনো রেকর্ড নেই</div>;
}

function ReportTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-muted/60">
            {headers.map((h) => (
              <th key={h} className="border px-2 py-1 text-left font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="even:bg-muted/20">
              {r.map((c, j) => (
                <td key={j} className="border px-2 py-1 align-top">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
