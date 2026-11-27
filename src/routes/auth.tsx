import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";
import { Mail, KeyRound, ArrowLeft, Phone, ShieldCheck, AlertCircle, LogOut, Lock, User, Loader2, ArrowRight, Wallet, Users, Banknote, BarChart3 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { adminPinLogin, requestAdminPinResetOtp, requestSmsOtp, verifyAndResetAdminPin, verifySmsOtp } from "@/lib/sms-otp.functions";
import { getAdminMobile, setAdminMobile, setAdminPin } from "@/lib/admin-settings";
import kmLogo from "@/assets/km-logo.png";

const searchSchema = z.object({
  denied: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: searchSchema,
});

type Mode = "pin" | "email" | "mobile";
type Step = "credentials" | "code" | "reset_pin";

function AuthPage() {
  const { user, loading } = useAuth();
  const { denied } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<Mode>("pin");
  const [step, setStep] = useState<Step>("credentials");

  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");

  const [resolvedEmail, setResolvedEmail] = useState("");
  const [resolvedMobile, setResolvedMobile] = useState("");
  const [maskedMobile, setMaskedMobile] = useState("");

  const [failedAttempts, setFailedAttempts] = useState(0);

  // PIN reset states
  const [resetCode, setResetCode] = useState("");
  const [newResetPin, setNewResetPin] = useState("");
  const [confirmResetPin, setConfirmResetPin] = useState("");
  const [resetMaskedMobile, setResetMaskedMobile] = useState("");
  const [resetSending, setResetSending] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetErr, setResetErr] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [signingGoogle, setSigningGoogle] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [pinErr, setPinErr] = useState<string | null>(null);

  const showErr = (title: string, description?: string) => {
    setErrMsg(description ? `${title} — ${description}` : title);
    toast.error(title, description ? { description } : undefined);
  };
  const clearErr = () => {
    setErrMsg(null);
    setPinErr(null);
  };

  if (!loading && user && !denied) return <Navigate to="/dashboard" />;

  const signInGoogle = async () => {
    setSigningGoogle(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("Google সাইন-ইন ব্যর্থ");
      setSigningGoogle(false);
    }
  };

  const signOutCurrent = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const startPinLogin = async (targetPin?: string) => {
    const pinToUse = (targetPin ?? pin).trim();
    clearErr();
    if (!/^\d{4}$/.test(pinToUse)) {
      setPinErr("৪ ডিজিটের পিন দিন");
      return;
    }
    setLoggingIn(true);
    try {
      const cachedMobile = getAdminMobile();
      const res = await adminPinLogin({
        data: {
          pin: pinToUse,
          mobile: cachedMobile || undefined,
        },
      });

      if (res.mobile) {
        setAdminMobile(res.mobile);
      }
      setAdminPin(pinToUse);

      const { error } = await supabase.auth.verifyOtp({
        token_hash: res.tokenHash,
        type: "magiclink",
      });
      if (error) throw new Error(error.message);

      setFailedAttempts(0);
      toast.success("এডমিন লগইন সফল হয়েছে!");
      window.location.href = "/dashboard";
    } catch {
      setFailedAttempts((prev) => prev + 1);
      setPinErr("পিন ভুল হয়েছে");
    } finally {
      setLoggingIn(false);
    }
  };

  const openPinReset = async () => {
    setStep("reset_pin");
    setResetErr(null);
    setResetCode("");
    setNewResetPin("");
    setConfirmResetPin("");
    setResetSending(true);
    try {
      const cachedMobile = getAdminMobile();
      const res = await requestAdminPinResetOtp({ data: { mobile: cachedMobile || undefined } });
      setResetMaskedMobile(res.maskedMobile);
      if (res.mobile) setAdminMobile(res.mobile);
      toast.success("রিসেট কোড পাঠানো হয়েছে", { description: "আপনার মোবাইলে SMS চেক করুন" });
    } catch (e: any) {
      setResetErr(e?.message || "কোড পাঠানো ব্যর্থ হয়েছে");
    } finally {
      setResetSending(false);
    }
  };

  const handleResendResetOtp = async () => {
    setResetErr(null);
    setResetSending(true);
    try {
      const cachedMobile = getAdminMobile();
      const res = await requestAdminPinResetOtp({ data: { mobile: cachedMobile || undefined } });
      setResetMaskedMobile(res.maskedMobile);
      toast.success("রিসেট কোড আবার পাঠানো হয়েছে");
    } catch (e: any) {
      setResetErr(e?.message || "কোড পাঠানো ব্যর্থ হয়েছে");
    } finally {
      setResetSending(false);
    }
  };

  const handleConfirmResetPin = async () => {
    setResetErr(null);
    if (!/^\d{6}$/.test(resetCode)) {
      setResetErr("৬ ডিজিটের সঠিক কোড দিন");
      return;
    }
    if (!/^\d{4}$/.test(newResetPin)) {
      setResetErr("নতুন পিন ৪ ডিজিটের হতে হবে");
      return;
    }
    if (newResetPin !== confirmResetPin) {
      setResetErr("নতুন পিন দুটি মিলছে না");
      return;
    }

    setResetting(true);
    try {
      const cachedMobile = getAdminMobile();
      const res = await verifyAndResetAdminPin({
        data: {
          code: resetCode,
          newPin: newResetPin,
          mobile: cachedMobile || undefined,
        },
      });

      if (res.mobile) setAdminMobile(res.mobile);
      setAdminPin(newResetPin);

      const { error } = await supabase.auth.verifyOtp({
        token_hash: res.tokenHash,
        type: "magiclink",
      });
      if (error) throw new Error(error.message);

      setFailedAttempts(0);
      toast.success("পিন সফলভাবে রিসেট ও লগইন হয়েছে!");
      window.location.href = "/dashboard";
    } catch (e: any) {
      setResetErr(e?.message || "পিন রিসেট ব্যর্থ হয়েছে");
    } finally {
      setResetting(false);
    }
  };

  const startMobile = async () => {
    clearErr();
    if (!/^\d{11}$/.test(mobile)) return showErr("মোবাইল নাম্বার সঠিক নয়", "১১ ডিজিটের বাংলাদেশী নাম্বার দিন");
    if (!/^\d{4}$/.test(pin)) return showErr("পিন সঠিক নয়", "৪ ডিজিটের পিন দিন");
    setSending(true);
    try {
      const res = await requestSmsOtp({ data: { mobile, pin } });
      setResolvedMobile(mobile);
      setMaskedMobile(res.maskedMobile);
      setResolvedEmail("");
      setStep("code");
      toast.success("কোড পাঠানো হয়েছে", { description: "আপনার মোবাইলে SMS চেক করুন" });
    } catch (e: any) {
      const msg = e?.message || "";
      if (/পিন|মোবাইল/.test(msg)) showErr("মোবাইল বা পিন ভুল", "সেটিংস-এ সেট করা নাম্বার ও পিন দিন");
      else showErr("কোড পাঠানো ব্যর্থ", msg || "একটু পরে আবার চেষ্টা করুন");
    } finally {
      setSending(false);
    }
  };

  const startEmail = async () => {
    clearErr();
    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return showErr("ইমেইল সঠিক নয়", "সঠিক ফরম্যাটে ইমেইল দিন");
    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: window.location.origin },
    });
    setSending(false);
    if (error) return showErr("ইমেইলে কোড পাঠানো ব্যর্থ", error.message);
    toast.success("কোড পাঠানো হয়েছে", { description: "আপনার ইনবক্স চেক করুন" });
    setResolvedEmail(trimmed);
    setStep("code");
  };

  const resend = async () => {
    clearErr();
    setSending(true);
    try {
      if (resolvedMobile) {
        const res = await requestSmsOtp({ data: { mobile: resolvedMobile, pin } });
        setMaskedMobile(res.maskedMobile);
        toast.success("কোড আবার পাঠানো হয়েছে");
      } else if (resolvedEmail) {
        const { error } = await supabase.auth.signInWithOtp({
          email: resolvedEmail,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw new Error(error.message);
        toast.success("কোড আবার পাঠানো হয়েছে");
      }
    } catch (e: any) {
      showErr("পাঠানো ব্যর্থ", e?.message || "একটু পরে আবার চেষ্টা করুন");
    } finally {
      setSending(false);
    }
  };

  const verifyOtp = async () => {
    clearErr();
    if (!/^\d{6}$/.test(code)) return showErr("কোড সঠিক নয়", "৬ ডিজিটের কোড দিন");
    setVerifying(true);
    try {
      if (resolvedMobile) {
        const res = await verifySmsOtp({ data: { mobile: resolvedMobile, code } });
        const { error } = await supabase.auth.verifyOtp({ token_hash: res.tokenHash, type: "magiclink" });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.auth.verifyOtp({ email: resolvedEmail, token: code, type: "email" });
        if (error) throw new Error("কোড ভুল বা মেয়াদ শেষ");
      }
      toast.success("লগইন সফল");
    } catch (e: any) {
      const msg = e?.message || "";
      if (/মেয়াদ|expire/i.test(msg)) showErr("কোডের মেয়াদ শেষ", "কোড আবার পাঠান");
      else if (/অনেকবার/.test(msg)) showErr("অনেকবার ভুল হয়েছে", "নতুন কোড নিন");
      else showErr("কোড ভুল", "৬-ডিজিটের কোডটি মিলিয়ে আবার লিখুন");
    } finally {
      setVerifying(false);
    }
  };

  const switchMode = (next: Mode) => {
    clearErr();
    setMode(next);
    setStep("credentials");
    setCode("");
    setResolvedEmail("");
    setResolvedMobile("");
    setMaskedMobile("");
  };

  const fieldCls =
    "h-12 rounded-xl border-border bg-background text-base shadow-xs transition focus-visible:border-red-500 focus-visible:ring-4 focus-visible:ring-red-500/15";
  const primaryBtnCls =
    "w-full h-12 rounded-xl bg-red-600 text-base font-semibold text-white shadow-sm shadow-red-600/20 transition hover:bg-red-700 active:scale-[0.99] disabled:opacity-60 cursor-pointer";
  const linkBtnCls =
    "inline-flex items-center gap-1.5 text-sm font-medium text-red-600 transition hover:text-red-700 hover:underline underline-offset-4 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300";

  const heading =
    step === "reset_pin"
      ? { title: "পিন রিসেট করুন", sub: "SMS-এ পাওয়া কোড দিয়ে নতুন পিন সেট করুন" }
      : step === "code"
        ? { title: "কোড যাচাই করুন", sub: "আপনাকে পাঠানো ৬ ডিজিটের কোডটি লিখুন" }
        : mode === "email"
          ? { title: "ইমেইল দিয়ে লগইন", sub: "আপনার এডমিন ইমেইলে একটি লগইন কোড পাঠানো হবে" }
          : { title: "আবার স্বাগতম", sub: "চালিয়ে যেতে আপনার ৪ ডিজিটের এডমিন পিন দিন" };

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr] selection:bg-red-500 selection:text-white">
      {/* ───────── Brand panel (desktop) ───────── */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#5f0f14] via-red-800 to-red-600 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_top_left,black_30%,transparent_75%)]" />
        <div className="pointer-events-none absolute -right-32 -bottom-32 h-[26rem] w-[26rem] rounded-full bg-amber-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -top-20 -left-20 h-72 w-72 rounded-full bg-rose-300/20 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white p-1.5 shadow-lg shadow-black/20">
            <img src={kmLogo} alt="Kuakata Multimedia" className="h-full w-full object-contain" />
          </div>
          <div className="leading-tight">
            <p className="text-base font-bold tracking-tight">Kuakata Multimedia</p>
            <p className="text-xs font-medium text-white/70">Finance Suite</p>
          </div>
        </div>

        <div className="relative max-w-md space-y-8">
          <div className="space-y-3">
            <h2 className="text-4xl font-bold leading-[1.25] tracking-tight">
              টিম, বেতন ও হিসাব —<br />সব এক জায়গায়।
            </h2>
            <p className="text-base leading-relaxed text-white/75">
              কুয়াকাটা মাল্টিমিডিয়ার আয়-ব্যয়, সদস্যদের পেমেন্ট এবং বকেয়া এক ড্যাশবোর্ডে পরিষ্কারভাবে দেখুন।
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {[
              { icon: Wallet, label: "আয়-ব্যয়ের হিসাব" },
              { icon: Users, label: "টিম ও সদস্য" },
              { icon: Banknote, label: "বেতন ও বকেয়া" },
              { icon: BarChart3, label: "রিপোর্ট ও বিশ্লেষণ" },
            ].map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="flex items-center gap-2.5 rounded-xl border border-white/15 bg-white/[0.07] px-3.5 py-3 text-sm font-medium backdrop-blur-sm"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="h-4 w-4" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center justify-between text-xs text-white/60">
          <span>© {new Date().getFullYear()} Kuakata Multimedia</span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> নিরাপদ এনক্রিপ্টেড লগইন
          </span>
        </div>
      </aside>

      {/* ───────── Form panel ───────── */}
      <main className="relative flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(220,38,38,0.07),transparent_60%)] lg:hidden" />

        <div className="relative w-full max-w-[400px]">
          {/* Mobile brand header */}
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white p-2 shadow-md ring-1 ring-black/5 dark:bg-zinc-900 dark:ring-white/10">
              <img src={kmLogo} alt="Kuakata Multimedia" className="h-full w-full object-contain" />
            </div>
            <div>
              <p className="text-lg font-bold tracking-tight">Kuakata Multimedia</p>
              <p className="text-xs font-medium text-muted-foreground">টিম ও বেতন ব্যবস্থাপনা</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_40px_-12px_rgba(0,0,0,0.12)] sm:p-8">
            {/* Heading */}
            <div className="mb-6 space-y-1.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{heading.title}</h1>
              <p className="text-sm text-muted-foreground">{heading.sub}</p>
            </div>

            <div className="space-y-5">
              {denied && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="leading-snug">
                    এই অ্যাকাউন্টে access নেই। শুধু অনুমোদিত admin ইমেইল দিয়ে লগইন করুন।
                  </span>
                </div>
              )}

              {user && denied && (
                <Button variant="outline" className="h-11 w-full rounded-xl" onClick={signOutCurrent}>
                  <LogOut className="mr-2 h-4 w-4" /> অন্য অ্যাকাউন্টে সাইন-ইন করুন
                </Button>
              )}

              {errMsg && mode !== "pin" && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl border border-destructive/25 bg-destructive/5 px-3.5 py-3 text-sm text-destructive animate-in fade-in slide-in-from-top-1"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="leading-snug font-medium">{errMsg}</span>
                </div>
              )}

              {/* Mode switch */}
              {step === "credentials" && (
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm font-medium" role="tablist">
                  {([
                    { key: "pin", label: "এডমিন পিন", icon: Lock, active: mode === "pin" || mode === "mobile" },
                    { key: "email", label: "ইমেইল", icon: Mail, active: mode === "email" },
                  ] as const).map(({ key, label, icon: Icon, active }) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => switchMode(key)}
                      className={`flex items-center justify-center gap-2 rounded-lg py-2.5 transition-all duration-200 cursor-pointer ${
                        active
                          ? "bg-background text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className={`h-4 w-4 ${active ? "text-red-600 dark:text-red-400" : ""}`} />
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Mode 1: Admin PIN Login */}
              {step === "credentials" && mode === "pin" && (
                <div className="space-y-5 animate-in fade-in">
                  <div className="space-y-2.5">
                    <PinBoxes
                      value={pin}
                      error={!!pinErr}
                      disabled={loggingIn}
                      onChange={(val) => {
                        setPinErr(null);
                        setPin(val);
                        if (val.length === 4) startPinLogin(val);
                      }}
                      onEnter={() => startPinLogin(pin)}
                    />
                    {pinErr && (
                      <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400 animate-in fade-in slide-in-from-top-1">
                        <AlertCircle className="h-4 w-4" />
                        {pinErr}
                      </p>
                    )}
                  </div>

                  <Button className={primaryBtnCls} onClick={() => startPinLogin(pin)} disabled={loggingIn || pin.length !== 4}>
                    {loggingIn ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        যাচাই করা হচ্ছে…
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        প্রবেশ করুন
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>

                  {failedAttempts >= 3 && (
                    <div className="text-center animate-in fade-in slide-in-from-top-1">
                      <button type="button" onClick={openPinReset} className={linkBtnCls}>
                        <KeyRound className="h-4 w-4" />
                        পিন ভুলে গেছেন? OTP দিয়ে রিসেট করুন
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Step: Reset PIN via SMS OTP */}
              {step === "reset_pin" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStep("credentials");
                      setPinErr(null);
                      setResetErr(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" /> ফিরে যান
                  </button>

                  <div className="flex items-start gap-2.5 rounded-xl border border-border bg-muted/60 px-3.5 py-3 text-sm text-muted-foreground">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    <span className="leading-snug">
                      {resetMaskedMobile
                        ? `${resetMaskedMobile} নাম্বারে SMS-এ ৬ ডিজিটের কোড পাঠানো হয়েছে।`
                        : "আপনার নিবন্ধিত মোবাইল নাম্বারে SMS কোড পাঠানো হচ্ছে…"}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">৬ ডিজিটের কোড</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoComplete="one-time-code"
                      autoFocus
                      placeholder="••••••"
                      className={`${fieldCls} text-center font-mono text-xl tracking-[0.5em]`}
                      value={resetCode}
                      onChange={(e) => {
                        setResetErr(null);
                        setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">নতুন পিন</Label>
                      <Input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={4}
                        placeholder="••••"
                        className={`${fieldCls} text-center font-mono text-lg tracking-[0.4em]`}
                        value={newResetPin}
                        onChange={(e) => {
                          setResetErr(null);
                          setNewResetPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                        }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">আবার লিখুন</Label>
                      <Input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={4}
                        placeholder="••••"
                        className={`${fieldCls} text-center font-mono text-lg tracking-[0.4em]`}
                        value={confirmResetPin}
                        onChange={(e) => {
                          setResetErr(null);
                          setConfirmResetPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                        }}
                      />
                    </div>
                  </div>

                  {resetErr && (
                    <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400 animate-in fade-in">
                      <AlertCircle className="h-4 w-4" />
                      {resetErr}
                    </p>
                  )}

                  <Button
                    className={primaryBtnCls}
                    onClick={handleConfirmResetPin}
                    disabled={resetting || resetCode.length !== 6 || newResetPin.length !== 4 || confirmResetPin.length !== 4}
                  >
                    {resetting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        রিসেট হচ্ছে…
                      </span>
                    ) : (
                      "পিন রিসেট ও লগইন করুন"
                    )}
                  </Button>

                  <div className="text-center">
                    <button type="button" onClick={handleResendResetOtp} disabled={resetSending} className={linkBtnCls}>
                      {resetSending ? "পাঠানো হচ্ছে…" : "কোড আবার পাঠান"}
                    </button>
                  </div>
                </div>
              )}

              {/* Mode 2: Optional Mobile + SMS OTP fallback */}
              {step === "credentials" && mode === "mobile" && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">মোবাইল SMS লগইন</span>
                    <button type="button" onClick={() => switchMode("pin")} className={linkBtnCls}>
                      ← শুধু পিন দিয়ে লগইন
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">মোবাইল নাম্বার</Label>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={11}
                        placeholder="01XXXXXXXXX"
                        className={`${fieldCls} pl-10`}
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 11))}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">পিন (৪ ডিজিট)</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={4}
                      placeholder="••••"
                      className={`${fieldCls} text-center font-mono text-lg tracking-[0.5em]`}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                      onKeyDown={(e) => e.key === "Enter" && startMobile()}
                    />
                  </div>
                  <Button className={primaryBtnCls} onClick={startMobile} disabled={sending || mobile.length !== 11 || pin.length !== 4}>
                    {sending ? "পাঠানো হচ্ছে…" : "মোবাইলে কোড পাঠান"}
                  </Button>
                </div>
              )}

              {/* Mode 3: Email OTP */}
              {step === "credentials" && mode === "email" && (
                <div className="space-y-5 animate-in fade-in">
                  <div className="space-y-1.5">
                    <Label className="text-sm font-medium">এডমিন ইমেইল</Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoFocus
                        placeholder="admin@example.com"
                        className={`${fieldCls} pl-10`}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && startEmail()}
                      />
                    </div>
                  </div>
                  <Button className={primaryBtnCls} onClick={startEmail} disabled={sending || !email.trim()}>
                    {sending ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        পাঠানো হচ্ছে…
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        ইমেইলে কোড পাঠান
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </div>
              )}

              {/* Step: verify OTP code */}
              {step === "code" && (
                <div className="space-y-4 animate-in fade-in">
                  <button
                    type="button"
                    onClick={() => { setStep("credentials"); setCode(""); }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" /> ফিরে যান
                  </button>
                  <div className="space-y-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      autoComplete="one-time-code"
                      autoFocus
                      placeholder="••••••"
                      className={`${fieldCls} h-14 text-center font-mono text-2xl font-semibold tracking-[0.5em]`}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                    />
                    <p className="text-center text-xs text-muted-foreground">
                      {resolvedMobile ? `${maskedMobile} নাম্বারে পাঠানো SMS কোড লিখুন` : `${maskEmail(resolvedEmail)}-এ পাঠানো কোড লিখুন`}
                    </p>
                  </div>
                  <Button className={primaryBtnCls} onClick={verifyOtp} disabled={verifying || code.length !== 6}>
                    {verifying ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        যাচাই হচ্ছে…
                      </span>
                    ) : (
                      "লগইন করুন"
                    )}
                  </Button>
                  <div className="text-center">
                    <button type="button" onClick={resend} disabled={sending} className={linkBtnCls}>
                      {sending ? "পাঠানো হচ্ছে…" : "কোড আবার পাঠান"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Member login */}
            <div className="mt-6">
              <div className="relative mb-5 flex items-center">
                <div className="flex-1 border-t border-border" />
                <span className="px-3 text-xs font-medium text-muted-foreground">অথবা</span>
                <div className="flex-1 border-t border-border" />
              </div>
              <a
                href="/member-login"
                className="group flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border bg-background text-sm font-medium text-foreground shadow-xs transition hover:border-red-500/40 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30 dark:hover:text-red-300"
              >
                <User className="h-4 w-4 text-muted-foreground transition group-hover:text-red-600" />
                সদস্য হিসেবে লগইন করুন
                <ArrowRight className="h-4 w-4 opacity-50 transition-transform group-hover:translate-x-0.5" />
              </a>
            </div>
          </div>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground lg:hidden">
            <ShieldCheck className="h-3.5 w-3.5" /> নিরাপদ এনক্রিপ্টেড লগইন · © {new Date().getFullYear()} Kuakata Multimedia
          </p>
        </div>
      </main>
    </div>
  );
}

function PinBoxes({
  value,
  onChange,
  onEnter,
  error,
  disabled,
  length = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter: () => void;
  error?: boolean;
  disabled?: boolean;
  length?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative mx-auto w-fit">
      <input
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={length}
        autoFocus
        aria-label="৪ ডিজিটের এডমিন পিন"
        aria-invalid={error || undefined}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        onKeyDown={(e) => e.key === "Enter" && onEnter()}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div className="flex gap-3">
        {Array.from({ length }).map((_, i) => {
          const filled = i < value.length;
          const active = focused && !disabled && (i === value.length || (value.length === length && i === length - 1));
          return (
            <div
              key={i}
              className={`flex h-14 w-14 items-center justify-center rounded-xl border-2 bg-background transition-all duration-150 sm:h-16 sm:w-16 ${
                error
                  ? "border-red-500 bg-red-50 dark:bg-red-950/30"
                  : active
                    ? "border-red-500 ring-4 ring-red-500/15"
                    : filled
                      ? "border-foreground/25"
                      : "border-border"
              }`}
            >
              {filled ? (
                <span className="h-3 w-3 rounded-full bg-foreground animate-in zoom-in-50 duration-150" />
              ) : active ? (
                <span className="h-6 w-0.5 animate-pulse rounded-full bg-red-500" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function maskEmail(e: string) {
  if (!e) return "";
  const [name, domain] = e.split("@");
  if (!domain) return e;
  const visible = name.slice(0, 2);
  return `${visible}${"•".repeat(Math.max(name.length - 2, 1))}@${domain}`;
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1S8.7 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.6 14.6 2.7 12 2.7 6.9 2.7 2.8 6.8 2.8 12s4.1 9.3 9.2 9.3c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1-.1-1.6H12z" />
    </svg>
  );
}
