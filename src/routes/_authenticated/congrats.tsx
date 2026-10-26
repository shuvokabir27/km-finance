import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MemberAvatar } from "@/components/member-avatar";
import { taka, toBn, bnDate } from "@/lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Check, Search, Download, MessageCircle, Sparkles, PartyPopper, TrendingUp, Wand2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateCongratsMessage } from "@/lib/congrats-ai.functions";
import kmLogo from "@/assets/km-logo.png";

export const Route = createFileRoute("/_authenticated/congrats")({
  component: CongratsPage,
});

type Member = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  photo_url: string | null;
  type: "daily" | "monthly";
  rate: number;
};

function CongratsPage() {
  const { data: members = [] } = useQuery({
    queryKey: ["members-for-congrats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id,name,role,phone,photo_url,type,rate")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Member[];
    },
  });

  const [memberId, setMemberId] = useState("");
  const selected = members.find((m) => m.id === memberId) ?? null;
  const [oldSalary, setOldSalary] = useState<number | "">("");
  const [newSalary, setNewSalary] = useState<number | "">("");
  const [effectiveDate, setEffectiveDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [message, setMessage] = useState(
    "আপনার নিষ্ঠা ও কঠোর পরিশ্রমের স্বীকৃতি স্বরূপ আপনার সম্মানী বৃদ্ধি করা হলো। আগামী দিনগুলোতেও আপনার সাফল্য কামনা করছি।",
  );

  useEffect(() => {
    if (selected) {
      setOldSalary(selected.rate ?? 0);
      setNewSalary("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const callGenerate = useServerFn(generateCongratsMessage);

  async function onAutoGenerate() {
    if (!selected) return toast.error("সদস্য বাছাই করুন");
    const n = Number(newSalary) || 0;
    const o = Number(oldSalary) || 0;
    if (!n) return toast.error("নতুন বেতন লিখুন");
    setAiBusy(true);
    try {
      const res = await callGenerate({
        data: {
          memberName: selected.name,
          role: selected.role,
          oldSalary: o,
          newSalary: n,
          hint: message.trim(),
        },
      });
      if (res?.message) {
        setMessage(res.message);
        toast.success("বার্তা তৈরি হয়েছে");
      }
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("429")) toast.error("রেট লিমিট — কিছুক্ষণ পরে আবার চেষ্টা করুন");
      else if (msg.includes("402")) toast.error("AI ক্রেডিট শেষ — Settings → Plans & credits");
      else toast.error("বার্তা তৈরিতে সমস্যা");
    } finally {
      setAiBusy(false);
    }
  }

  const diff = useMemo(() => {
    const o = Number(oldSalary) || 0;
    const n = Number(newSalary) || 0;
    const d = n - o;
    const pct = o > 0 ? (d / o) * 100 : 0;
    return { diff: d, pct };
  }, [oldSalary, newSalary]);

  async function renderCard(): Promise<{ blob: Blob; dataUrl: string } | null> {
    if (!cardRef.current) return null;
    const { toPng, toBlob } = await import("html-to-image");
    const node = cardRef.current;
    const w = node.offsetWidth;
    const h = node.offsetHeight;
    const opts = {
      quality: 0.98,
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: "#ffffff",
      width: w,
      height: h,
      canvasWidth: w,
      canvasHeight: h,
      style: { transform: "none" },
    } as const;
    const dataUrl = await toPng(node, opts);
    const blob = await toBlob(node, opts);
    if (!blob) return null;
    return { blob, dataUrl };
  }

  function safeFilename(name: string) {
    return `congrats-${name.replace(/[^a-z0-9\u0980-\u09FF]+/gi, "_")}.png`;
  }

  function waNumber(mobile: string) {
    let d = mobile.replace(/[^0-9]/g, "");
    if (d.startsWith("0")) d = "880" + d.slice(1);
    else if (!d.startsWith("880")) d = "880" + d;
    return d;
  }

  async function onDownload() {
    if (!selected) return toast.error("সদস্য বাছাই করুন");
    setBusy("download");
    try {
      const out = await renderCard();
      if (!out) throw new Error("render failed");
      const a = document.createElement("a");
      a.href = out.dataUrl;
      a.download = safeFilename(selected.name);
      a.click();
      toast.success("কার্ড ডাউনলোড হয়েছে");
    } catch (e) {
      console.error(e);
      toast.error("কার্ড তৈরিতে সমস্যা");
    } finally {
      setBusy(null);
    }
  }

  async function onShareWhatsApp() {
    if (!selected) return toast.error("সদস্য বাছাই করুন");
    if (!selected.phone) return toast.error("সদস্যের মোবাইল নম্বর নেই");
    setBusy("share");
    try {
      const out = await renderCard();
      if (!out) throw new Error("render failed");
      const file = new File([out.blob], safeFilename(selected.name), { type: "image/png" });
      const text = `প্রিয় ${selected.name}, অভিনন্দন! আপনার নতুন সম্মানী: ${taka(Number(newSalary) || 0)}`;
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] }) && navigator.share) {
        try {
          await navigator.share({ files: [file], title: "অভিনন্দন কার্ড", text });
          toast.success("শেয়ার চালু হয়েছে");
          return;
        } catch {
          /* fall through to wa.me */
        }
      }
      const a = document.createElement("a");
      a.href = out.dataUrl;
      a.download = safeFilename(selected.name);
      a.click();
      const num = waNumber(selected.phone);
      const url = `https://wa.me/${num}?text=${encodeURIComponent(text + "\n\n(কার্ডটি ডাউনলোড হয়েছে — চ্যাটে অ্যাটাচ করে পাঠান)")}`;
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success("WhatsApp খোলা হয়েছে — কার্ডটি অ্যাটাচ করুন");
    } catch (e) {
      console.error(e);
      toast.error("শেয়ারে সমস্যা");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-amber-400 to-pink-500 text-white shadow-md">
          <PartyPopper className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold">বেতন বৃদ্ধির অভিনন্দন কার্ড</h1>
          <p className="text-xs text-muted-foreground">কার্ড তৈরি করে সদস্যকে WhatsApp-এ পাঠান</p>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-4">
        <div className="space-y-3 rounded-2xl border bg-card p-4">
          <Field label="সদস্য">
            <MemberPicker members={members} value={memberId} onChange={setMemberId} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="পূর্বের বেতন (৳)">
              <input
                type="number"
                value={oldSalary}
                onChange={(e) => setOldSalary(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                placeholder="0"
              />
            </Field>
            <Field label="নতুন বেতন (৳)">
              <input
                type="number"
                value={newSalary}
                onChange={(e) => setNewSalary(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                placeholder="0"
              />
            </Field>
          </div>
          <Field label="কার্যকর তারিখ">
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
            />
          </Field>
          <Field label="শুভেচ্ছা বার্তা">
            <div className="space-y-2">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="অল্প কিছু লিখুন (যেমন: পরিশ্রমের পুরস্কার) — তারপর AI দিয়ে সম্পূর্ণ করুন"
                className="w-full resize-none rounded-xl border bg-background px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={onAutoGenerate}
                disabled={aiBusy || !selected || !newSalary}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-pink-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:from-amber-100 hover:to-pink-100 disabled:opacity-60 dark:border-amber-700/50 dark:from-amber-950/40 dark:to-pink-950/40 dark:text-amber-200"
              >
                {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                {aiBusy ? "তৈরি হচ্ছে…" : "AI দিয়ে অটো-জেনারেট"}
              </button>
            </div>
          </Field>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={onShareWhatsApp}
              disabled={!selected || !newSalary || busy !== null}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <MessageCircle className="h-4 w-4" />
              {busy === "share" ? "প্রস্তুত হচ্ছে…" : "WhatsApp-এ পাঠান"}
            </button>
            <button
              onClick={onDownload}
              disabled={!selected || !newSalary || busy !== null}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border bg-background px-4 py-2.5 text-sm font-medium transition hover:bg-accent disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              ডাউনলোড
            </button>
          </div>
          {selected && !selected.phone && (
            <p className="text-xs text-amber-600">এই সদস্যের মোবাইল নম্বর সংরক্ষিত নেই — WhatsApp পাঠানো যাবে না।</p>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border bg-muted/30 p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">প্রিভিউ (পোস্টার 720×1080)</div>
          <PreviewFrame>
            <CongratsCard
              ref={cardRef}
              member={selected}
              oldSalary={Number(oldSalary) || 0}
              newSalary={Number(newSalary) || 0}
              diff={diff.diff}
              pct={diff.pct}
              effectiveDate={effectiveDate}
              message={message}
            />
          </PreviewFrame>
        </div>
      </div>
    </div>
  );
}

function PreviewFrame({ children }: { children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / 720);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div className="flex justify-center">
      <div
        ref={wrapRef}
        className="relative w-full overflow-hidden"
        style={{ maxWidth: 360, aspectRatio: "720 / 1080" }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 720,
            height: 1080,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

type CardProps = {
  member: Member | null;
  oldSalary: number;
  newSalary: number;
  diff: number;
  pct: number;
  effectiveDate: string;
  message: string;
};

const CongratsCard = forwardRef<HTMLDivElement, CardProps>(function CongratsCard(
  { member, oldSalary, newSalary, diff, pct, effectiveDate, message },
  ref,
) {
  return (
    <div
      ref={ref}
      className="relative overflow-hidden flex flex-col"
      style={{
        width: 720,
        height: 1080,
        background:
          "radial-gradient(ellipse 90% 70% at 15% 0%, #b91c1c 0%, transparent 55%), radial-gradient(ellipse 80% 60% at 100% 100%, #7f1d1d 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 50% 50%, #dc2626 0%, transparent 65%), linear-gradient(160deg, #991b1b 0%, #7f1d1d 50%, #450a0a 100%)",
        color: "#fff5f5",
        fontFamily: "'Hind Siliguri', system-ui, sans-serif",
      }}
    >
      {/* Decorative glow orbs */}
      <div
        className="pointer-events-none absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,180,180,0.55) 0%, transparent 65%)", filter: "blur(40px)" }}
      />
      <div
        className="pointer-events-none absolute -right-40 top-1/3 h-[480px] w-[480px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(255,100,100,0.45) 0%, transparent 65%)", filter: "blur(50px)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 left-1/4 h-[380px] w-[380px] rounded-full"
        style={{ background: "radial-gradient(circle, rgba(127,29,29,0.6) 0%, transparent 65%)", filter: "blur(45px)" }}
      />
      {/* Subtle grain / dot pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.15]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />

      {/* Top glass header */}
      <div
        className="relative mx-6 mt-6 flex items-center justify-between rounded-2xl px-6 py-4"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
          backdropFilter: "blur(20px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
        }}
      >
        <div className="flex items-center gap-3">
          <img src={kmLogo} alt="" className="h-11 w-11 rounded-xl bg-white p-1.5" />
          <div className="text-[15px] font-bold uppercase tracking-[0.28em] text-white">Kuakata Multimedia</div>
        </div>
        <div
          className="rounded-full px-4 py-1.5 text-[12px] font-bold uppercase tracking-[0.25em]"
          style={{
            background: "rgba(255,255,255,0.95)",
            border: "1px solid rgba(255,255,255,0.6)",
            color: "#991b1b",
          }}
        >
          Salary Increment
        </div>
      </div>

      {/* Hero */}
      <div className="relative px-10 pt-8 text-center">
        <div className="text-[18px] font-bold uppercase tracking-[0.45em]" style={{ color: "#ffffff" }}>
          Congratulations
        </div>
        <div
          className="mt-3 font-black"
          style={{
            fontSize: 84,
            lineHeight: 1.25,
            paddingBottom: 8,
            letterSpacing: "-0.02em",
            background: "linear-gradient(180deg, #ffffff 0%, #fecaca 60%, #f87171 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
            filter: "drop-shadow(0 4px 24px rgba(239,68,68,0.35))",
          }}
        >
          অভিনন্দন
        </div>
        <div
          className="mx-auto mt-6 h-[3px] w-24 rounded-full"
          style={{ background: "linear-gradient(90deg, transparent, #ef4444, transparent)" }}
        />
      </div>

      {/* Avatar with glass ring + flowers & balloons */}
      <div className="relative mt-6 flex justify-center">
        {/* Balloons floating around */}
        <div className="pointer-events-none absolute -top-6 left-8 text-[56px] leading-none" style={{ transform: "rotate(-15deg)", filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.35))" }}>🎈</div>
        <div className="pointer-events-none absolute -top-10 right-10 text-[64px] leading-none" style={{ transform: "rotate(12deg)", filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.35))" }}>🎈</div>
        <div className="pointer-events-none absolute top-6 right-2 text-[42px] leading-none" style={{ transform: "rotate(20deg)", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.3))" }}>🎈</div>
        <div className="pointer-events-none absolute top-4 left-0 text-[44px] leading-none" style={{ transform: "rotate(-22deg)", filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.3))" }}>🎉</div>
        <div className="pointer-events-none absolute -top-4 right-1/3 text-[38px] leading-none" style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.3))" }}>✨</div>

        {/* Flowers ring around avatar */}
        <div className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 text-[40px] leading-none" style={{ transform: "translate(-50%, 40%)", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))" }}>🌹</div>
        <div className="pointer-events-none absolute bottom-2 text-[36px] leading-none" style={{ left: "calc(50% - 130px)", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))" }}>🌸</div>
        <div className="pointer-events-none absolute bottom-2 text-[36px] leading-none" style={{ left: "calc(50% + 95px)", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))" }}>🌺</div>
        <div className="pointer-events-none absolute top-10 text-[32px] leading-none" style={{ left: "calc(50% - 140px)", transform: "rotate(-30deg)", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))" }}>🌷</div>
        <div className="pointer-events-none absolute top-10 text-[32px] leading-none" style={{ left: "calc(50% + 110px)", transform: "rotate(30deg)", filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.3))" }}>🌼</div>

        <div
          className="relative rounded-full p-[3px]"
          style={{
            background: "conic-gradient(from 140deg, #ef4444, #fecaca, #dc2626, #7f1d1d, #ef4444)",
            boxShadow: "0 20px 60px -10px rgba(239,68,68,0.55), 0 0 0 6px rgba(255,255,255,0.04)",
          }}
        >
          <div
            className="rounded-full p-[4px]"
            style={{
              background: "rgba(69,10,10,0.55)",
              backdropFilter: "blur(10px)",
            }}
          >
            <MemberAvatar
              name={member?.name ?? "—"}
              photoUrl={member?.photo_url ?? null}
              size="xl"
              className="!h-40 !w-40 !text-5xl"
            />
          </div>
        </div>
      </div>


      {/* Name & role */}
      <div className="relative px-10 pt-6 text-center">
        <div className="text-[16px] font-bold uppercase tracking-[0.35em]" style={{ color: "#ffffff", opacity: 0.85 }}>প্রিয়</div>
        <div className="mt-3 text-[48px] font-black leading-tight tracking-tight" style={{ color: "#ffffff" }}>
          {member?.name ?? "সদস্য"}
        </div>
        {member?.role && (
          <div className="mt-2 text-[20px] font-semibold" style={{ color: "#ffffff", opacity: 0.9 }}>{member.role}</div>
        )}
      </div>

      {/* Salary glass card */}
      <div
        className="relative mx-10 mt-6 overflow-hidden rounded-3xl px-6 py-6 text-center"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.09) 0%, rgba(239,68,68,0.08) 50%, rgba(255,255,255,0.03) 100%)",
          backdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid rgba(255,255,255,0.15)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.18), 0 24px 60px -20px rgba(239,68,68,0.35)",
        }}
      >
        {/* corner accent */}
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(239,68,68,0.5) 0%, transparent 70%)", filter: "blur(20px)" }}
        />
        <div className="relative text-[16px] font-bold uppercase tracking-[0.3em]" style={{ color: "#ffffff" }}>
          সম্মানী বৃদ্ধি পেয়েছে
        </div>
        <div className="relative mt-4 flex items-center justify-center gap-5">
          {oldSalary > 0 && (
            <div className="text-[22px] font-semibold line-through" style={{ color: "#ffffff", opacity: 0.55 }}>{taka(oldSalary)}</div>
          )}
          <div
            className="text-[62px] font-black leading-none tracking-tight"
            style={{ color: "#ffffff", textShadow: "0 4px 24px rgba(0,0,0,0.35)" }}
          >
            {taka(newSalary)}
          </div>
        </div>
        {diff > 0 && (
          <div className="relative mt-4 grid grid-cols-2 items-stretch gap-3">
            <div
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-[16px] font-bold"
              style={{
                background: "#ffffff",
                color: "#991b1b",
                boxShadow: "0 8px 24px -6px rgba(0,0,0,0.4)",
              }}
            >
              <TrendingUp className="h-4 w-4" />
              +{taka(diff)}
            </div>
            <div
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-2"
              style={{
                background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
                color: "#451a03",
                boxShadow: "0 8px 24px -6px rgba(0,0,0,0.4)",
              }}
            >
              <span className="text-[22px] font-black leading-none">{toBn(pct.toFixed(1))}%</span>
              <span className="text-[13px] font-black leading-none">বৃদ্ধি</span>
            </div>
          </div>
        )}
      </div>

      {/* Message */}
      <div
        className="relative flex-1 px-12 pt-8 text-center text-[22px] font-medium leading-relaxed"
        style={{ color: "#ffffff", opacity: 0.95 }}
      >
        {message}
      </div>

      {/* Footer glass */}
      <div
        className="relative mx-6 mb-6 flex items-center justify-between rounded-2xl px-6 py-4 text-[14px]"
        style={{
          background: "rgba(255,255,255,0.15)",
          backdropFilter: "blur(20px) saturate(160%)",
          border: "1px solid rgba(255,255,255,0.25)",
          color: "#ffffff",
        }}
      >
        <div className="truncate font-semibold uppercase tracking-[0.18em]">কার্যকর: {bnDate(effectiveDate)}</div>
        <div className="shrink-0 font-bold uppercase tracking-[0.18em]">— Kuakata Multimedia Finance</div>
      </div>
    </div>
  );
});

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
        <button type="button" className="flex w-full items-center gap-2 rounded-2xl border bg-background px-3 py-2 text-left text-sm">
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="খুঁজুন…" className="w-full bg-transparent text-sm outline-none" autoFocus />
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
