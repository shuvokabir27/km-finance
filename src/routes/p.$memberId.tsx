import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useRef, useState, cloneElement } from "react";
import { MemberOtpGate } from "@/components/member-otp-gate";
import { Landmark, Smartphone, User as UserIcon, Camera, ArrowLeft, Wallet, ReceiptText, CalendarDays, Gift, Clapperboard, CalendarRange, Plus, Trash2, Handshake, ChevronDown } from "lucide-react";
import {
  getPublicProfile,
  updatePublicProfilePhoto,
  addPublicMemberAccount,
  deletePublicMemberAccount,
  type PublicProfile,
} from "@/lib/public-profile.functions";
import { smartCropPortrait } from "@/lib/image-crop";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { taka, toBn, bnDate } from "@/lib/format";
import { ACCOUNT_KIND_LABEL, type AccountKind, BD_BANKS } from "@/lib/bd-banks";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BN_MONTHS = ["জানুয়ারি", "ফেব্রুয়ারি", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্টেম্বর", "অক্টোবর", "নভেম্বর", "ডিসেম্বর"];

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "ক্যাশ",
  bkash: "বিকাশ",
  nagad: "নগদ",
  rocket: "রকেট",
  upay: "উপায়",
  bank: "ব্যাংক",
};

export const Route = createFileRoute("/p/$memberId")({
  validateSearch: (s: Record<string, unknown>) => ({ t: typeof s.t === "string" ? s.t : "" }),
  component: PublicProfilePage,
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="grid min-h-screen place-items-center bg-background px-4 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-lg font-semibold">প্রফাইল লোড হয়নি</h1>
          <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
          <Button onClick={() => { router.invalidate(); reset(); }}>আবার চেষ্টা করুন</Button>
        </div>
      </div>
    );
  },
  notFoundComponent: () => (
    <div className="grid min-h-screen place-items-center bg-background px-4 text-center">
      <div>
        <h1 className="text-2xl font-bold">প্রফাইল পাওয়া যায়নি</h1>
        <Link to="/" className="mt-3 inline-flex text-sm text-primary underline">হোম</Link>
      </div>
    </div>
  ),
  head: () => ({
    meta: [
      { title: "সদস্য প্রফাইল — Kuakata Multimedia Finance" },
      { name: "description", content: "মোবাইল OTP দিয়ে লগইন করে নিজের হিসাব দেখুন" },
      { property: "og:title", content: "সদস্য প্রফাইল — Kuakata Multimedia Finance" },
      { property: "og:description", content: "মোবাইল OTP দিয়ে লগইন করে নিজের হিসাব দেখুন" },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function PublicProfilePage() {
  const { memberId } = Route.useParams();
  const storageKey = `km-member-session:${memberId}`;
  const [session, setSession] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setSession(localStorage.getItem(storageKey));
    setReady(true);
  }, [storageKey]);
  // ইনস্টল করলে যেন সরাসরি সদস্যের প্রফাইল খোলে — পেজভিত্তিক ম্যানিফেস্ট
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (link) link.href = `/api/public/manifest?memberId=${memberId}`;
  }, [memberId]);
  const q = useQuery({
    queryKey: ["member-profile", memberId, session],
    queryFn: () => getPublicProfile({ data: { memberId, token: session! } }),
    enabled: !!session,
    retry: false,
  });
  const logout = () => { localStorage.removeItem(storageKey); setSession(null); };
  if (!ready || (session && q.isLoading)) {
    return <div className="grid min-h-screen place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }
  if (!session || q.isError) {
    return (
      <MemberOtpGate
        memberId={memberId}
        error={q.isError ? (q.error as Error).message : null}
        onLogin={(s) => { localStorage.setItem(storageKey, s); setSession(s); }}
      />
    );
  }
  return <ProfileView data={q.data!} token={session} refetch={() => q.refetch()} onLogout={logout} />;
}



function ProfileView({ data, token, refetch, onLogout }: { data: PublicProfile; token: string; refetch: () => void; onLogout: () => void }) {
  const { member, balance, general_balance, channel_accounts, accounts, shootings_count, range } = data;

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const [preset, setPreset] = useState<"this" | "last" | "custom" | "all">("this");
  const [cFrom, setCFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [cTo, setCTo] = useState(iso(now));
  const [view, setView] = useState<"all" | "attendance" | "payments">("all");
  const showAtt = view !== "payments";
  const showPay = view !== "attendance";
  let fFrom = "", fTo = "", periodLabel = "সব সময়";
  if (preset === "this") {
    fFrom = iso(new Date(now.getFullYear(), now.getMonth(), 1));
    fTo = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    periodLabel = `${BN_MONTHS[now.getMonth()]} ${toBn(String(now.getFullYear()))}`;
  } else if (preset === "last") {
    const l = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    fFrom = iso(l);
    fTo = iso(new Date(l.getFullYear(), l.getMonth() + 1, 0));
    periodLabel = `${BN_MONTHS[l.getMonth()]} ${toBn(String(l.getFullYear()))}`;
  } else if (preset === "custom") {
    fFrom = cFrom; fTo = cTo;
    periodLabel = `${cFrom ? bnDate(cFrom) : "শুরু"} — ${cTo ? bnDate(cTo) : "এখন"}`;
  }
  const inRange = (d: string) => {
    const x = d.slice(0, 10);
    return (!fFrom || x >= fFrom) && (!fTo || x <= fTo);
  };
  const shootings = data.shootings.filter((s) => inRange(s.shoot_date));
  const payments = data.payments.filter((p) => inRange(p.paid_at));
  const salaries = data.salaries.filter((s: { month: string }) => inRange(s.month));
  const bonuses = data.bonuses.filter((b: { given_at: string }) => inRange(b.given_at));
  const monthLabel = periodLabel;
  const totalEarned = data.shootings.reduce((a, s) => a + s.earned, 0);
  const monthShootings = shootings;
  const monthEarned = shootings.reduce((a, s) => a + s.earned, 0);
  const totalPaid = data.payments.reduce((a, p) => a + p.amount, 0);
  const monthPayments = payments;
  const monthPaid = payments.reduce((a, p) => a + p.amount, 0);
  const allPayments = [...payments].sort((a, b) => b.paid_at.localeCompare(a.paid_at));
  const channelNameOf = (id: string | null) => (id ? channel_accounts.find((c) => c.id === id)?.name ?? "শেয়ার চ্যানেল" : null);
  const byDateDesc = <T extends { shoot_date: string }>(arr: T[]) => [...arr].sort((a, b) => b.shoot_date.localeCompare(a.shoot_date));
  const generalShootings = byDateDesc(shootings.filter((s) => !channel_accounts.some((c) => c.name === s.channel)));

  const [photoUrl, setPhotoUrl] = useState<string | null>(member.photo_signed_url);

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/60 via-background to-background pb-20">
      <div className="mx-auto max-w-md px-4 pt-6">
        <div className="mb-3 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowLeft className="h-3.5 w-3.5" /> হোম
          </Link>
          <button onClick={onLogout} className="text-xs text-muted-foreground underline">লগআউট</button>
        </div>

        <div className="rounded-3xl border border-white/60 bg-white/80 p-5 shadow-[0_20px_50px_-20px_rgba(5,150,105,0.35)] backdrop-blur-xl dark:bg-zinc-900/70">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-accent text-accent-foreground ring-4 ring-white/70 shadow-lg dark:ring-zinc-800/70">
                {photoUrl ? (
                  <img src={photoUrl} alt={member.name} className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              {member.has_phone && (
                <ChangePhotoDialog
                  memberId={member.id}
                  token={token}
                  phoneMasked={member.phone_masked}
                  onUpdated={(url) => setPhotoUrl(url)}
                />

              )}
            </div>
            <h1 className="mt-3 text-xl font-bold">{member.name}</h1>
            <div className="mt-1 flex items-center justify-center gap-2 text-xs">
              {member.role && <span className="text-muted-foreground">{member.role}</span>}
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${member.type === "daily" ? "bg-warning/15 text-warning-foreground" : "bg-primary/10 text-primary"}`}>
                {member.type === "daily" ? "দৈনিক" : "মাসিক"}
              </span>
            </div>
          </div>

          {(range.from || range.to) && (
            <div className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <CalendarRange className="h-3.5 w-3.5" />
              {range.from ? bnDate(range.from) : "শুরু"} — {range.to ? bnDate(range.to) : "এখন"}
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 gap-2">
            <Stat label="মোট ব্যালেন্স" value={taka(balance)} accent={balance > 0 ? "text-success" : ""} />
            <Stat label={member.type === "daily" ? "দৈনিক রেট" : "মাসিক"} value={taka(member.rate)} />
            <Stat label="শুটিং" value={toBn(String(shootings_count))} />
          </div>

          {channel_accounts.length > 0 && (
            <div className="mt-3 space-y-1 rounded-2xl border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">সাধারণ হিসাব</span>
                <b>{taka(general_balance)}</b>
              </div>
              {channel_accounts.map((channel) => (
                <div key={channel.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-muted-foreground">{channel.name}</span>
                  <b className={channel.balance > 0 ? "text-success" : ""}>{taka(channel.balance)}</b>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border bg-card p-2">
          <div className="mb-2">
            <Select value={view} onValueChange={(v) => setView(v as typeof view)}>
              <SelectTrigger className="h-9 rounded-xl text-sm font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">📋 সব হিসাব</SelectItem>
                <SelectItem value="attendance">🎬 শুধু হাজিরা</SelectItem>
                <SelectItem value="payments">💰 শুধু পেমেন্ট</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {([["this", "এই মাস"], ["last", "গত মাস"], ["custom", "কাস্টম"], ["all", "সব"]] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setPreset(k)}
                className={`rounded-xl px-2 py-1.5 text-xs font-medium transition ${preset === k ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"}`}
              >
                {l}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Input type="date" value={cFrom} onChange={(e) => setCFrom(e.target.value)} />
              <Input type="date" value={cTo} onChange={(e) => setCTo(e.target.value)} />
            </div>
          )}
        </div>

        <Section icon={<CalendarRange className="h-4 w-4" />} title={`হিসাব — ${monthLabel}`}>
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="মোট হাজিরা (সব সময়)"
              value={toBn(String(data.shootings.length))}
              sub={member.type === "daily" ? `আয় ${taka(totalEarned)}` : undefined}
            />
            <Stat
              label="এই সময়ের হাজিরা"
              value={toBn(String(monthShootings.length))}
              sub={member.type === "daily" ? `আয় ${taka(monthEarned)}` : undefined}
            />
            <Stat
              label="মোট পেমেন্ট (সব সময়)"
              value={taka(totalPaid)}
              sub={`${toBn(String(data.payments.length))}টি পেমেন্ট`}
            />
            <Stat
              label="এই সময়ের পেমেন্ট"
              value={taka(monthPaid)}
              sub={`${toBn(String(monthPayments.length))}টি পেমেন্ট`}
            />
          </div>
        </Section>

        {showAtt && member.type === "daily" && (
          <Section icon={<Clapperboard className="h-4 w-4" />} title={`সাধারণ হাজিরা (${toBn(String(generalShootings.length))})`}>
            <CollapsibleList
              items={generalShootings}
              itemKey={(s) => s.id}
              empty="এই সময়ে কোনো শুটিংয়ে উপস্থিত ছিল না"
              renderItem={(s) => (
                <li className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {bnDate(s.shoot_date)}
                      {s.director ? ` • ${s.director}` : ""}
                      {s.channel ? ` • ${s.channel}` : ""}
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold">{taka(s.earned)}</span>
                </li>
              )}
            />
          </Section>
        )}

        {showAtt && member.type === "daily" && channel_accounts.map((channel) => (
          <Section
            key={channel.id}
            icon={<Handshake className="h-4 w-4" />}
            title={`${channel.name} — হাজিরা (${toBn(String(channel.shootings.length))})`}
          >
            <div className="mb-2 grid grid-cols-3 gap-2">
              <Stat label="হাজিরা আয়" value={taka(channel.earned)} />
              <Stat label="পেয়েছেন" value={taka(channel.paid)} />
              <Stat label="পাওনা" value={taka(channel.balance)} accent={channel.balance > 0 ? "text-success" : ""} />
            </div>
            <CollapsibleList
              items={byDateDesc(channel.shootings)}
              itemKey={(s) => s.id}
              empty="এই চ্যানেলে কোনো হাজিরা নেই"
              renderItem={(s) => (
                <li className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {bnDate(s.shoot_date)}{s.director ? ` • ${s.director}` : ""} • {channel.name}
                    </div>
                  </div>
                  <span className="shrink-0 font-semibold">{taka(s.earned)}</span>
                </li>
              )}
            />
          </Section>
        ))}

        {view === "all" && <Section
          icon={<Wallet className="h-4 w-4" />}
          title="পেমেন্ট একাউন্ট"
          action={
            <AddAccountDialog
              memberId={member.id}
              token={token}
              phoneMasked={member.phone_masked}
              onAdded={refetch}
            />
          }
        >
          {accounts.length === 0 ? (
            <Empty>কোনো একাউন্ট যোগ করা হয়নি — উপরের "যোগ" বাটনে চাপ দিয়ে যোগ করুন</Empty>
          ) : (
            <ul className="space-y-2">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-2xl border bg-card p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                    {a.kind === "bank" ? <Landmark className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="font-medium">
                      {ACCOUNT_KIND_LABEL[a.kind as AccountKind] ?? a.kind}
                      {a.kind === "bank" && a.bank_name ? ` — ${a.bank_name}` : ""}
                    </div>
                    <div className="font-mono text-base">{toBn(a.account_number)}</div>
                    {(a.account_holder || a.branch) && (
                      <div className="text-muted-foreground">
                        {a.account_holder}{a.account_holder && a.branch ? " • " : ""}{a.branch}
                      </div>
                    )}
                  </div>
                  <DeleteAccountButton
                    memberId={member.id}
                    token={token}
                    phoneMasked={member.phone_masked}
                    accountId={a.id}
                    onDeleted={refetch}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>}

        {showPay && salaries.length > 0 && (
          <Section icon={<CalendarDays className="h-4 w-4" />} title="মাসিক বেতন">
            <ul className="divide-y rounded-2xl border bg-card">
              {salaries.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{bnDate(s.month)}</span>
                  <span className="font-semibold">{taka(s.amount)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {showPay && bonuses.length > 0 && (
          <Section icon={<Gift className="h-4 w-4" />} title="বোনাস">
            <ul className="divide-y rounded-2xl border bg-card">
              {bonuses.map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div>{bnDate(b.given_at)}</div>
                    {b.note && <div className="truncate text-xs text-muted-foreground">{b.note}</div>}
                  </div>
                  <span className="font-semibold text-success">+{taka(b.amount)}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {showPay && <Section icon={<ReceiptText className="h-4 w-4" />} title={`পেমেন্ট হিস্টরি (${toBn(String(allPayments.length))})`}>
          <CollapsibleList
            items={allPayments}
            itemKey={(p) => p.id}
            empty="এখনও কোনো পেমেন্ট নেই"
            renderItem={(p) => <PaymentRow p={p} channelName={channelNameOf(p.channel_id)} />}
          />
        </Section>}
      </div>
    </div>
  );
}

function Stat({ label, value, accent = "", sub }: { label: string; value: string; accent?: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-muted/40 px-3 py-2 text-center">
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
      <div className={`text-base font-bold ${accent}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Section({ icon, title, children, action }: { icon: React.ReactNode; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800/80 dark:text-emerald-200/80">
          {icon}{title}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-dashed bg-card p-4 text-center text-xs text-muted-foreground">{children}</div>;
}

// তালিকার শেষের ৩ট (সবচেয়ে নতুন) দেখায় — বাকিসব "বিস্তারিত" বাটনে ক্লিক করলে খুলে যাব
function CollapsibleList<T>({ items, limit = 3, itemKey, renderItem, empty }: {
  items: T[];
  limit?: number;
  itemKey: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  empty?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return empty ? <Empty>{empty}</Empty> : null;
  const head = items.slice(0, limit);
  const tail = items.slice(limit);
  const row = (it: T) => cloneElement(renderItem(it) as React.ReactElement, { key: itemKey(it) });
  return (
    <div className="space-y-2">
      <ul className={cn("divide-y border bg-card", open && tail.length > 0 ? "rounded-t-2xl border-b-0" : "rounded-2xl")}>
        {head.map(row)}
      </ul>
      {open && tail.length > 0 && (
        <ul className="animate-in fade-in slide-in-from-top-2 duration-300 divide-y rounded-b-2xl border bg-card">
          {tail.map(row)}
        </ul>
      )}
      {tail.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 rounded-2xl border bg-primary/5 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/10 active:scale-[0.99]"
        >
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-300", open && "rotate-180")} />
          {open ? "আঙুস্টান করুন" : `বিস্তারিত দেখুন (আরও ${toBn(String(tail.length))}ট)`}
        </button>
      )}
    </div>
  );
}

function PaymentRow({ p, channelName }: { p: PublicProfile["payments"][number]; channelName: string | null }) {
  return (
    <li className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>{bnDate(p.paid_at)}</span>
          {p.method && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
            </span>
          )}
          {channelName && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              {channelName}
            </span>
          )}
        </div>
        {p.bank_account_number && (
          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
            A/C: {toBn(p.bank_account_number)}
          </div>
        )}
        {p.note && <div className="truncate text-xs text-muted-foreground">{p.note}</div>}
      </div>
      <span className="font-semibold">{taka(p.amount)}</span>
    </li>
  );
}

function ChangePhotoDialog({
  memberId,
  token,
  phoneMasked,
  onUpdated,
}: { memberId: string; token: string; phoneMasked: string | null; onUpdated: (url: string | null) => void }) {

  const [open, setOpen] = useState(false);
  const [last4, setLast4] = useState("");
  const [cropped, setCropped] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setLast4("");
    setCropped(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const handleFile = async (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("শুধু ছবি বাছুন");
      return;
    }
    setProcessing(true);
    try {
      const { blob } = await smartCropPortrait(f);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setCropped(blob);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (e: any) {
      toast.error(e?.message || "ছবি প্রস্তুত করা যায়নি");
    } finally {
      setProcessing(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!cropped) throw new Error("ছবি বাছুন");
      if (!/^[0-9]{4}$/.test(last4)) throw new Error("৪ ডিজিট দিন");
      const buf = new Uint8Array(await cropped.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.byteLength; i++) bin += String.fromCharCode(buf[i]);
      const base64 = btoa(bin);
      return await updatePublicProfilePhoto({
        data: { memberId, token, last4, fileBase64: base64, contentType: "image/jpeg", ext: "jpg" },
      });
    },
    onSuccess: (res) => {
      toast.success("ছবি আপডেট হয়েছে");
      onUpdated(res.photo_signed_url);
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-white dark:ring-zinc-900"
          aria-label="ছবি পরিবর্তন"
        >
          <Camera className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader><DialogTitle>প্রফাইল ছবি পরিবর্তন</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mx-auto grid h-28 w-28 place-items-center overflow-hidden rounded-full bg-accent ring-2 ring-primary/30"
          >
            {processing ? (
              <span className="text-[11px] text-muted-foreground">প্রস্তুত হচ্ছে…</span>
            ) : previewUrl ? (
              <img src={previewUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Camera className="h-7 w-7 text-muted-foreground" />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </button>
          <p className="text-center text-[11px] text-muted-foreground">
            যেকোনো সাইজের ছবি আপলোড করুন — মুখ ও বডি স্বয়ংক্রিয়ভাবে ক্রপ হয়ে যাবে।
          </p>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              ফোন নম্বরের শেষ ৪ ডিজিট
              {phoneMasked && <span className="ml-1 font-mono text-foreground/70">({toBn(phoneMasked)})</span>}
            </label>
            <Input
              inputMode="numeric"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              placeholder="যেমন: ৪৫৬৭"
              className="text-center font-mono text-lg tracking-[0.5em]"
            />
          </div>
          <Button
            onClick={() => save.mutate()}
            disabled={save.isPending || !cropped || last4.length !== 4 || processing}
            className="w-full"
          >
            {save.isPending ? "আপলোড হচ্ছে…" : "সংরক্ষণ"}
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            শুধু সদস্য নিজেই (যার ফোন নম্বরের শেষ ৪ ডিজিট মেলে) ছবি পরিবর্তন করতে পারবেন।
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type AccKind = "bkash" | "nagad" | "rocket" | "upay" | "bank";

function AddAccountDialog({
  memberId, token, phoneMasked, onAdded,
}: { memberId: string; token: string; phoneMasked: string | null; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AccKind>("bkash");
  const [acc, setAcc] = useState("");
  const [holder, setHolder] = useState("");
  const [bank, setBank] = useState("");
  const [branch, setBranch] = useState("");
  const [last4, setLast4] = useState("");

  const reset = () => {
    setKind("bkash"); setAcc(""); setHolder(""); setBank(""); setBranch(""); setLast4("");
  };

  const add = useMutation({
    mutationFn: async () => {
      return await addPublicMemberAccount({
        data: {
          memberId, token, last4,
          kind, account_number: acc.trim(),
          account_holder: holder.trim() || null,
          bank_name: kind === "bank" ? bank.trim() : null,
          branch: kind === "bank" ? (branch.trim() || null) : null,
        },
      });
    },
    onSuccess: () => {
      toast.success("একাউন্ট যোগ হয়েছে");
      setOpen(false);
      reset();
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSubmit =
    /^[0-9]{4}$/.test(last4) &&
    acc.trim().length >= 4 &&
    (kind !== "bank" || bank.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs">
          <Plus className="h-3.5 w-3.5" /> যোগ
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm rounded-3xl">
        <DialogHeader><DialogTitle>পেমেন্ট একাউন্ট যোগ করুন</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">ধরন</label>
            <Select value={kind} onValueChange={(v) => setKind(v as AccKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bkash">bKash</SelectItem>
                <SelectItem value="nagad">Nagad</SelectItem>
                <SelectItem value="rocket">Rocket</SelectItem>
                <SelectItem value="upay">Upay</SelectItem>
                <SelectItem value="bank">Bank Account</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {kind === "bank" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">ব্যাংকের নাম</label>
                <Select value={bank} onValueChange={setBank}>
                  <SelectTrigger><SelectValue placeholder="বাছুন" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {BD_BANKS.map((b) => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">ব্রাঞ্চ (ঐচ্ছিক)</label>
                <Input value={branch} onChange={(e) => setBranch(e.target.value)} maxLength={120} />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {kind === "bank" ? "একাউন্ট নম্বর" : "মোবাইল/একাউন্ট নম্বর"}
            </label>
            <Input
              value={acc}
              onChange={(e) => setAcc(e.target.value.replace(/[^0-9A-Za-z-]/g, "").slice(0, 40))}
              inputMode={kind === "bank" ? "text" : "numeric"}
              className="font-mono"
              maxLength={40}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">নাম (একাউন্ট হোল্ডার)</label>
            <Input value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={120} />
          </div>

          <div className="space-y-1.5 rounded-xl border border-dashed bg-card/50 p-3">
            <label className="text-xs font-medium text-muted-foreground">
              ফোন নম্বরের শেষ ৪ ডিজিট দিয়ে ভেরিফাই করুন
              {phoneMasked && <span className="ml-1 font-mono text-foreground/70">({toBn(phoneMasked)})</span>}
            </label>
            <Input
              inputMode="numeric"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              placeholder="যেমন: ৪৫৬৭"
              className="text-center font-mono text-lg tracking-[0.5em]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => add.mutate()} disabled={!canSubmit || add.isPending} className="w-full">
            {add.isPending ? "সংরক্ষণ হচ্ছে…" : "যোগ করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountButton({
  memberId, token, phoneMasked, accountId, onDeleted,
}: { memberId: string; token: string; phoneMasked: string | null; accountId: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [last4, setLast4] = useState("");

  const del = useMutation({
    mutationFn: async () => {
      return await deletePublicMemberAccount({ data: { memberId, token, last4, accountId } });
    },
    onSuccess: () => {
      toast.success("একাউন্ট মুছে ফেলা হয়েছে");
      setOpen(false);
      setLast4("");
      onDeleted();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setLast4(""); }}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="মুছে ফেলুন"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-xs rounded-3xl">
        <DialogHeader><DialogTitle>একাউন্ট মুছে ফেলুন</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            ফোন নম্বরের শেষ ৪ ডিজিট
            {phoneMasked && <span className="ml-1 font-mono text-foreground/70">({toBn(phoneMasked)})</span>}
          </label>
          <Input
            inputMode="numeric"
            maxLength={4}
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
            className="text-center font-mono text-lg tracking-[0.5em]"
          />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={last4.length !== 4 || del.isPending}
            onClick={() => del.mutate()}
            className="w-full"
          >
            {del.isPending ? "মুছছে…" : "মুছে ফেলুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
