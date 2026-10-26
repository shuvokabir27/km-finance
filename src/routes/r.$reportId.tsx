import { createFileRoute, notFound } from "@tanstack/react-router";
import { getSharedReport } from "@/lib/shared-report.functions";
import { taka, toBn, bnDate } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = { facebook: "ফেসবুক", youtube: "ইউটিউব", ads: "বিজ্ঞাপন", other: "অন্যান্য" };

export const Route = createFileRoute("/r/$reportId")({
  validateSearch: (s: Record<string, unknown>) => ({ t: typeof s.t === "string" ? s.t : "" }),
  loaderDeps: ({ search }) => ({ t: search.t }),
  loader: async ({ params, deps }) => {
    try {
      return await getSharedReport({ data: { id: params.reportId, token: deps.t } });
    } catch {
      throw notFound();
    }
  },
  head: ({ loaderData }) => {
    const title = loaderData ? `${loaderData.channel_name} — রিপোর্ট | Kuakata Multimedia Finance` : "রিপোর্ট | Kuakata Multimedia Finance";
    const desc = "শেয়ার চ্যানেলের আয়, খরচ ও শুটিং রিপোর্ট";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="grid min-h-screen place-items-center p-6 text-center text-muted-foreground">রিপোর্ট পাওয়া যায়নি</div>
  ),
  component: ReportPage,
});

const RED = "text-red-600 dark:text-red-400";
const GREEN = "text-emerald-600 dark:text-emerald-400";

function Box({ label, value, kind }: { label: string; value: number; kind: "income" | "expense" | "net" }) {
  const color = kind === "income" ? GREEN : kind === "expense" ? RED : value >= 0 ? GREEN : RED;
  return (
    <div className={`rounded-xl p-3 ${kind === "expense" ? "bg-red-500/10" : kind === "income" ? "bg-emerald-500/10" : value >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-base font-bold ${color}`}>{taka(value)}</div>
    </div>
  );
}

function ReportPage() {
  const r = Route.useLoaderData();
  const range = r.range.from || r.range.to
    ? `${r.range.from ? bnDate(r.range.from) : "শুরু"} — ${r.range.to ? bnDate(r.range.to) : "আজ"}`
    : "সব সময়";
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 print:p-0">
      <header className="rounded-2xl bg-primary p-5 text-primary-foreground">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs opacity-80">Kuakata Multimedia Finance · শেয়ার চ্যানেল রিপোর্ট</div>
            <h1 className="mt-1 text-2xl font-bold">{r.channel_name}</h1>
            <div className="mt-1 text-sm opacity-90">{range}{r.shooting_name ? ` · শুটিং: ${r.shooting_name}` : ""}</div>
          </div>
          {r.logo_url && (
            <img
              src={r.logo_url}
              alt={`${r.channel_name} লোগো`}
              className="h-16 w-16 shrink-0 rounded-xl border border-white/20 bg-white/10 object-cover"
            />
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Box label="ইনকাম" value={r.income_total} kind="income" />
        <Box label="মোট খরচ" value={r.attendance_total + r.extra_total} kind="expense" />
        <Box label="হাজিরা খরচ" value={r.attendance_total} kind="expense" />
        <Box label="অন্যান্য খরচ" value={r.extra_total} kind="expense" />
        <Box label="মোট লাভ" value={r.net} kind="net" />
      </div>

      {r.partners.length > 0 && (
        <Section title="মালিকদের ভাগ">
          {r.partners.map((p) => (
            <Row key={p.name} left={`${p.name} (${toBn(p.percent)}%)`} right={taka(p.share)} />
          ))}
        </Section>
      )}

      <Section title={`শুটিং (${toBn(r.shootings.length)} টি)`}>
        {r.shootings.length === 0 && <Empty />}
        {r.shootings.map((s) => (
          <Row
            key={s.id}
            left={<><div className="font-medium">{s.name}</div><div className="text-[11px] text-muted-foreground">{bnDate(s.shoot_date)} · {toBn(s.present)} জন · হাজিরা {taka(s.attendance)} · অন্যান্য {taka(s.extra)}</div></>}
            right={<span className={RED}>{taka(s.attendance + s.extra)}</span>}
          />
        ))}
      </Section>

      <Section title="সদস্যদের হাজিরা">
        {r.members.length === 0 && <Empty />}
        {r.members.map((m) => (
          <Row key={m.name} left={<>{m.name} <span className="text-[11px] text-muted-foreground">{m.role ?? ""} · {toBn(m.days)} শুটিং</span></>} right={<span className={RED}>{taka(m.earned)}</span>} />
        ))}
      </Section>

      <Section title="অন্যান্য খরচ">
        {r.extras.length === 0 && <Empty />}
        {r.extras.map((e) => (
          <Row key={e.label} left={<>{e.label} <span className="text-[11px] text-muted-foreground">{toBn(e.count)} বার</span></>} right={<span className={RED}>{taka(e.amount)}</span>} />
        ))}
      </Section>

      <Section title="ইনকাম">
        {r.incomes.length === 0 && <Empty />}
        {r.incomes.map((i) => (
          <Row key={i.id} left={<>{SOURCE_LABEL[i.source] ?? i.source} <span className="text-[11px] text-muted-foreground">{bnDate(i.earned_at)}{i.note ? ` · ${i.note}` : ""}</span></>} right={<span className={GREEN}>{taka(i.amount)}</span>} />
        ))}
      </Section>

      <button onClick={() => window.print()} className="w-full rounded-xl border py-2 text-sm font-medium print:hidden">প্রিন্ট / PDF</button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="mb-2 text-sm font-bold">{title}</h2>
      <div className="divide-y">{children}</div>
    </section>
  );
}
function Row({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 text-sm">
      <div className="min-w-0">{left}</div>
      <div className="shrink-0 font-semibold">{right}</div>
    </div>
  );
}
function Empty() {
  return <div className="py-2 text-xs text-muted-foreground">কিছু নেই</div>;
}
