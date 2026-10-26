import { createFileRoute, Navigate, useSearch } from "@tanstack/react-router";
import { Wallet, Mail, KeyRound, ArrowLeft, Phone, ShieldCheck, AlertCircle, LogOut } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { lovable } from "@/integrations/lovable";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { requestSmsOtp, verifySmsOtp } from "@/lib/sms-otp.functions";

const searchSchema = z.object({
  denied: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  validateSearch: searchSchema,
});

type Mode = "mobile" | "email";
type Step = "credentials" | "code";

function AuthPage() {
  const { user, loading } = useAuth();
  const { denied } = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<Mode>("mobile");
  const [step, setStep] = useState<Step>("credentials");

  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");

  const [resolvedEmail, setResolvedEmail] = useState("");
  const [resolvedMobile, setResolvedMobile] = useState("");
  const [maskedMobile, setMaskedMobile] = useState("");

  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [signingGoogle, setSigningGoogle] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const showErr = (title: string, description?: string) => {
    setErrMsg(description ? `${title} — ${description}` : title);
    toast.error(title, description ? { description } : undefined);
  };
  const clearErr = () => setErrMsg(null);

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-accent/30 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
            <Wallet className="h-7 w-7" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold">Kuakata Multimedia Finance</h1>
            <p className="text-sm text-muted-foreground">টিম ও বেতন ব্যবস্থাপনা</p>
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
          {denied && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-snug">
                এই অ্যাকাউন্টে access নেই। শুধু অনুমোদিত admin ইমেইল দিয়ে লগইন করুন।
              </span>
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={signInGoogle} disabled={signingGoogle}>
            <GoogleIcon /> {signingGoogle ? "লগইন হচ্ছে…" : "Google দিয়ে লগইন করুন"}
          </Button>

          {user && denied && (
            <Button variant="ghost" className="w-full" onClick={signOutCurrent}>
              <LogOut className="mr-2 h-4 w-4" /> অন্য অ্যাকাউন্টে সাইন-ইন করুন
            </Button>
          )}

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">অথবা</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {errMsg && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive animate-in fade-in slide-in-from-top-1"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="leading-snug">{errMsg}</span>
            </div>
          )}

          {step === "credentials" && (
            <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1 text-xs">
              <button
                type="button"
                onClick={() => switchMode("mobile")}
                className={`rounded-full py-1.5 font-medium transition ${
                  mode === "mobile" ? "bg-background shadow-sm" : "text-muted-foreground"
                }`}
              >
                মোবাইল + পিন
              </button>
              <button
                type="button"
                onClick={() => switchMode("email")}
                className={`rounded-full py-1.5 font-medium transition ${
                  mode === "email" ? "bg-background shadow-sm" : "text-muted-foreground"
                }`}
              >
                শুধু ইমেইল
              </button>
            </div>
          )}

          {step === "credentials" && mode === "mobile" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Phone className="h-3.5 w-3.5" /> মোবাইল
                </Label>
                <Input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={11}
                  placeholder="01XXXXXXXXX"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 11))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <ShieldCheck className="h-3.5 w-3.5" /> পিন (৪ ডিজিট)
                </Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="••••"
                  className="text-center font-mono text-lg tracking-[0.5em]"
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  onKeyDown={(e) => e.key === "Enter" && startMobile()}
                />
              </div>
              <Button className="w-full" onClick={startMobile} disabled={sending || mobile.length !== 11 || pin.length !== 4}>
                {sending ? "পাঠানো হচ্ছে…" : "মোবাইলে কোড পাঠান"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                সঠিক মোবাইল + পিন হলে নির্ধারিত নাম্বারে SMS-এ ৬-ডিজিট কোড আসবে
              </p>
            </div>
          )}

          {step === "credentials" && mode === "email" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <Mail className="h-3.5 w-3.5" /> ইমেইল
                </Label>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startEmail()}
                />
              </div>
              <Button className="w-full" onClick={startEmail} disabled={sending || !email.trim()}>
                {sending ? "পাঠানো হচ্ছে…" : "ইমেইলে কোড পাঠান"}
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                ইমেইলে ৬-ডিজিটের নতুন কোড আসবে
              </p>
            </div>
          )}

          {step === "code" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => { setStep("credentials"); setCode(""); }}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" /> ফিরে যান
              </button>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5 text-sm">
                  <KeyRound className="h-3.5 w-3.5" /> ৬-ডিজিট কোড
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="••••••"
                  className="text-center font-mono text-lg tracking-[0.5em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && verifyOtp()}
                />
                <p className="text-[11px] text-muted-foreground">
                  {resolvedMobile ? `${maskedMobile} নাম্বারে পাঠানো SMS কোড লিখুন` : `${maskEmail(resolvedEmail)}-এ পাঠানো কোড লিখুন`}
                </p>
              </div>
              <Button className="w-full" onClick={verifyOtp} disabled={verifying || code.length !== 6}>
                {verifying ? "যাচাই হচ্ছে…" : "লগইন করুন"}
              </Button>
              <button
                type="button"
                onClick={resend}
                disabled={sending}
                className="w-full text-center text-xs text-primary hover:underline disabled:opacity-50"
              >
                {sending ? "পাঠানো হচ্ছে…" : "কোড আবার পাঠান"}
              </button>
            </div>
          )}

          <p className="text-center text-[11px] text-muted-foreground">
            শুধু অনুমোদিত admin অ্যাকাউন্ট dashboard-এ access পাবে
          </p>
          <a href="/member-login" className="block text-center text-sm font-medium text-primary underline">
            সদস্য? মোবাইল OTP দিয়ে নিজের প্রফাইল দেখুন
          </a>
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
