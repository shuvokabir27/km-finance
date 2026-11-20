import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";
import { Mail, KeyRound, ArrowLeft, Phone, ShieldCheck, AlertCircle, LogOut, Lock, User, Sparkles, Loader2, ArrowRight } from "lucide-react";
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

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-rose-50 via-red-50/50 to-amber-50/60 dark:from-zinc-950 dark:via-rose-950/40 dark:to-neutral-950 px-4 py-10 selection:bg-red-500 selection:text-white">
      {/* Colorful floating ambient glows */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-gradient-to-br from-red-500/30 via-rose-400/20 to-amber-400/20 blur-3xl animate-pulse" />
      <div className="pointer-events-none absolute top-1/3 -right-28 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-rose-500/25 via-pink-500/20 to-orange-400/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/4 h-80 w-80 rounded-full bg-gradient-to-tr from-red-600/25 via-amber-400/20 to-rose-300/15 blur-3xl" />
      {/* Studio particle grid overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e11d48_1px,transparent_1px)] [background-size:20px_20px] opacity-[0.07]" />

      <div className="relative w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-7 flex flex-col items-center gap-3">
          <div className="relative group">
            <div className="absolute -inset-1.5 rounded-3xl bg-gradient-to-r from-red-600 via-rose-500 to-amber-500 opacity-75 blur-md group-hover:opacity-100 transition duration-500 animate-pulse" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white p-2 shadow-xl ring-2 ring-red-500/20 dark:bg-zinc-900">
              <img
                src={kmLogo}
                alt="Kuakata Multimedia"
                className="h-full w-full object-contain drop-shadow"
              />
            </div>
          </div>
          <div className="text-center space-y-1">
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-r from-red-600 via-rose-600 to-amber-600 bg-clip-text text-transparent">
              Kuakata Multimedia Finance
            </h1>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300 shadow-2xs">
              <Sparkles className="h-3 w-3 text-red-500 animate-spin" style={{ animationDuration: "8s" }} />
              টিম ও বেতন ব্যবস্থাপনা
            </div>
          </div>
        </div>

        {/* Glassmorphic Red Card */}
        <div className="relative space-y-5 rounded-3xl border border-red-500/20 bg-white/85 dark:bg-zinc-900/85 p-6 sm:p-8 shadow-[0_25px_60px_-15px_rgba(225,29,72,0.25)] backdrop-blur-2xl ring-1 ring-red-500/10">
          {denied && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-snug">
                এই অ্যাকাউন্টে access নেই। শুধু অনুমোদিত admin ইমেইল দিয়ে লগইন করুন।
              </span>
            </div>
          )}

          {user && denied && (
            <Button variant="ghost" className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30" onClick={signOutCurrent}>
              <LogOut className="mr-2 h-4 w-4" /> অন্য অ্যাকাউন্টে সাইন-ইন করুন
            </Button>
          )}

          {errMsg && mode !== "pin" && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive animate-in fade-in slide-in-from-top-1"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-snug font-medium">{errMsg}</span>
            </div>
          )}

          {step === "credentials" && (
            <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-red-500/10 dark:bg-zinc-800/60 p-1.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => switchMode("pin")}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition-all duration-200 ${
                  mode === "pin" || mode === "mobile"
                    ? "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-500/30 scale-[1.02]"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/40 dark:hover:bg-zinc-800"
                }`}
              >
                <Lock className="h-3.5 w-3.5" />
                এডমিন পিন
              </button>
              <button
                type="button"
                onClick={() => switchMode("email")}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 transition-all duration-200 ${
                  mode === "email"
                    ? "bg-gradient-to-r from-red-600 to-rose-600 text-white shadow-md shadow-red-500/30 scale-[1.02]"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/40 dark:hover:bg-zinc-800"
                }`}
              >
                <Mail className="h-3.5 w-3.5" />
                শুধু ইমেইল
              </button>
            </div>
          )}

          {/* Mode 1: Admin PIN Login (Default - Mobile number hidden) */}
          {step === "credentials" && mode === "pin" && (
            <div className="space-y-4 pt-1">
              <div className="space-y-2">
                <div className="relative">
                  <Input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    autoFocus
                    placeholder="••••"
                    className={`h-14 text-center font-mono text-3xl tracking-[0.6em] bg-white/70 dark:bg-zinc-950/70 shadow-inner rounded-2xl font-bold transition-all text-red-950 dark:text-red-100 placeholder:text-red-300 dark:placeholder:text-red-900 ${
                      pinErr
                        ? "border-red-500 ring-2 ring-red-500/30"
                        : "border-red-500/30 focus-visible:border-red-500 focus-visible:ring-2 focus-visible:ring-red-500/30"
                    }`}
                    value={pin}
                    onChange={(e) => {
                      setPinErr(null);
                      const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setPin(val);
                      if (val.length === 4) {
                        startPinLogin(val);
                      }
                    }}
                    onKeyDown={(e) => e.key === "Enter" && startPinLogin(pin)}
                  />
                </div>
                {pinErr && (
                  <p className="text-center text-xs font-semibold text-red-600 dark:text-red-400 animate-in fade-in slide-in-from-top-1">
                    {pinErr}
                  </p>
                )}
              </div>

              <Button
                className="w-full h-12 text-base font-bold rounded-2xl text-white bg-gradient-to-r from-red-600 via-rose-600 to-red-500 hover:from-red-500 hover:to-rose-600 shadow-lg shadow-red-600/35 hover:shadow-red-600/50 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 cursor-pointer"
                onClick={() => startPinLogin(pin)}
                disabled={loggingIn || pin.length !== 4}
              >
                {loggingIn ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    যাচাই ও প্রবেশ হচ্ছে…
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <ShieldCheck className="h-5 w-5" />
                    পিন দিয়ে প্রবেশ করুন
                  </span>
                )}
              </Button>

              {failedAttempts >= 3 && (
                <div className="pt-1 text-center animate-in fade-in slide-in-from-top-1">
                  <button
                    type="button"
                    onClick={openPinReset}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline transition cursor-pointer"
                  >
                    <KeyRound className="h-3.5 w-3.5" />
                    পিন ভুলে গেছেন? OTP দিয়ে রিসেট করুন
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step: Reset PIN via SMS OTP */}
          {step === "reset_pin" && (
            <div className="space-y-4 pt-1 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center justify-between pb-1 border-b border-red-500/10">
                <div className="flex items-center gap-2 text-sm font-bold text-red-600 dark:text-red-400">
                  <KeyRound className="h-4 w-4" />
                  <span>এডমিন পিন রিসেট</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStep("credentials");
                    setPinErr(null);
                    setResetErr(null);
                  }}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition"
                >
                  <ArrowLeft className="h-3 w-3" /> ফিরে যান
                </button>
              </div>

              <div className="rounded-xl bg-red-500/10 dark:bg-red-950/30 p-3 text-center">
                <p className="text-xs font-medium text-red-700 dark:text-red-300">
                  {resetMaskedMobile
                    ? `${resetMaskedMobile} নাম্বারে SMS-এ ৬ ডিজিটের ওটিপি পাঠানো হয়েছে।`
                    : "আপনার নিবন্ধিত মোবাইল নাম্বারে SMS কোড পাঠানো হচ্ছে…"}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">৬-ডিজিট কোড (SMS OTP)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoFocus
                  placeholder="••••••"
                  className="h-12 text-center font-mono text-xl tracking-[0.5em] bg-white/70 dark:bg-zinc-950/70 border-red-500/30 focus-visible:border-red-500 rounded-xl font-bold"
                  value={resetCode}
                  onChange={(e) => {
                    setResetErr(null);
                    setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">নতুন পিন (৪ ডিজিট)</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder="••••"
                    className="h-11 text-center font-mono text-lg tracking-[0.4em] bg-white/70 dark:bg-zinc-950/70 border-red-500/30 focus-visible:border-red-500 rounded-xl"
                    value={newResetPin}
                    onChange={(e) => {
                      setResetErr(null);
                      setNewResetPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">পুনরায় নতুন পিন</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    placeholder="••••"
                    className="h-11 text-center font-mono text-lg tracking-[0.4em] bg-white/70 dark:bg-zinc-950/70 border-red-500/30 focus-visible:border-red-500 rounded-xl"
                    value={confirmResetPin}
                    onChange={(e) => {
                      setResetErr(null);
                      setConfirmResetPin(e.target.value.replace(/\D/g, "").slice(0, 4));
                    }}
                  />
                </div>
              </div>

              {resetErr && (
                <p className="text-center text-xs font-semibold text-red-600 dark:text-red-400 animate-in fade-in">
                  {resetErr}
                </p>
              )}

              <Button
                className="w-full h-12 text-base font-bold rounded-2xl text-white bg-gradient-to-r from-red-600 via-rose-600 to-red-500 hover:from-red-500 hover:to-rose-600 shadow-lg shadow-red-600/35 hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                onClick={handleConfirmResetPin}
                disabled={resetting || resetCode.length !== 6 || newResetPin.length !== 4 || confirmResetPin.length !== 4}
              >
                {resetting ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    রিসেট ও লগইন হচ্ছে…
                  </span>
                ) : (
                  "পিন রিসেট ও লগইন করুন"
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={handleResendResetOtp}
                  disabled={resetSending}
                  className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 hover:underline disabled:opacity-50"
                >
                  {resetSending ? "পাঠানো হচ্ছে…" : "কোড আবার পাঠান"}
                </button>
              </div>
            </div>
          )}

          {/* Mode 2: Optional Mobile + SMS OTP fallback */}
          {step === "credentials" && mode === "mobile" && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">মোবাইল SMS লগইন</span>
                <button
                  type="button"
                  onClick={() => switchMode("pin")}
                  className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 hover:underline font-semibold"
                >
                  ← শুধু পিন দিয়ে লগইন
                </button>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Phone className="h-3.5 w-3.5 text-red-500" /> মোবাইল
                </Label>
                <Input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={11}
                  placeholder="01XXXXXXXXX"
                  className="bg-white/70 dark:bg-zinc-950/70 border-red-500/20 focus-visible:border-red-500 focus-visible:ring-red-500/30 rounded-xl"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 11))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <ShieldCheck className="h-3.5 w-3.5 text-red-500" /> পিন (৪ ডিজিট)
                </Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="••••"
                  className="text-center font-mono text-lg tracking-[0.5em] bg-white/70 dark:bg-zinc-950/70 border-red-500/20 focus-visible:border-red-500 focus-visible:ring-red-500/30 rounded-xl"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  onKeyDown={(e) => e.key === "Enter" && startMobile()}
                />
              </div>
              <Button
                className="w-full h-11 font-bold rounded-xl text-white bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-md shadow-red-500/30"
                onClick={startMobile}
                disabled={sending || mobile.length !== 11 || pin.length !== 4}
              >
                {sending ? "পাঠানো হচ্ছে…" : "মোবাইলে কোড পাঠান"}
              </Button>
            </div>
          )}

          {step === "credentials" && mode === "email" && (
            <div className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm font-semibold">
                  <Mail className="h-4 w-4 text-red-500" /> এডমিন ইমেইল
                </Label>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="admin@example.com"
                  className="h-11 bg-white/70 dark:bg-zinc-950/70 border-red-500/20 focus-visible:border-red-500 focus-visible:ring-red-500/30 rounded-xl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startEmail()}
                />
              </div>
              <Button
                className="w-full h-12 text-base font-bold rounded-2xl text-white bg-gradient-to-r from-red-600 via-rose-600 to-red-500 hover:from-red-500 hover:to-rose-500 shadow-lg shadow-red-500/30"
                onClick={startEmail}
                disabled={sending || !email.trim()}
              >
                {sending ? "পাঠানো হচ্ছে…" : "ইমেইলে কোড পাঠান"}
              </Button>
            </div>
          )}

          {step === "code" && (
            <div className="space-y-4 pt-1">
              <button
                type="button"
                onClick={() => { setStep("credentials"); setCode(""); }}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 dark:text-red-400 font-semibold"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> ফিরে যান
              </button>
              <div className="space-y-2">
                <Label className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wide">
                  <KeyRound className="h-4 w-4 text-red-500" /> ৬-ডিজিট কোড
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="••••••"
                  className="h-14 text-center font-mono text-2xl tracking-[0.5em] bg-white/70 dark:bg-zinc-950/70 border-red-500/30 focus-visible:border-red-500 focus-visible:ring-red-500/30 rounded-2xl shadow-inner font-bold"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                />
                <p className="text-center text-[11px] text-muted-foreground">
                  {resolvedMobile ? `${maskedMobile} নাম্বারে পাঠানো SMS কোড লিখুন` : `${maskEmail(resolvedEmail)}-এ পাঠানো কোড লিখুন`}
                </p>
              </div>
              <Button
                className="w-full h-12 text-base font-bold rounded-2xl text-white bg-gradient-to-r from-red-600 via-rose-600 to-red-500 hover:from-red-500 hover:to-rose-500 shadow-lg shadow-red-500/30"
                onClick={verifyOtp}
                disabled={verifying || code.length !== 6}
              >
                {verifying ? "যাচাই হচ্ছে…" : "লগইন করুন"}
              </Button>
              <button
                type="button"
                onClick={resend}
                disabled={sending}
                className="w-full text-center text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 hover:underline disabled:opacity-50"
              >
                {sending ? "পাঠানো হচ্ছে…" : "কোড আবার পাঠান"}
              </button>
            </div>
          )}

          {/* Member Login Pill Button */}
          <div className="pt-3 border-t border-red-500/10 flex justify-center">
            <a
              href="/member-login"
              className="group inline-flex items-center gap-2 rounded-full border border-red-500/25 bg-red-500/5 hover:bg-red-500/15 px-4 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-all duration-200 shadow-2xs hover:scale-105 active:scale-95"
            >
              <User className="h-3.5 w-3.5 text-red-500 group-hover:scale-110 transition-transform" />
              <span>সদস্য লগইন</span>
              <ArrowRight className="h-3 w-3 opacity-60 group-hover:translate-x-0.5 transition-transform" />
            </a>
          </div>
        </div>
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
