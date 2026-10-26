import { ReactNode, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings as SettingsIcon, ShieldCheck, Phone, Eye, EyeOff, Loader2, KeyRound, Palette, Check } from "lucide-react";
import { THEME_OPTIONS, getStoredTheme, setStoredTheme, type ThemeName } from "@/lib/theme";
import { toast } from "sonner";
import {
  getAdminMobile,
  getAdminPin,
  hasAdminPin,
  loadServerCredentials,
  saveServerCredentials,
  setAdminMobile,
  setAdminPin,
} from "@/lib/admin-settings";
import { requestSmsOtp, verifySmsOtp } from "@/lib/sms-otp.functions";

export function SettingsDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinRevealed, setPinRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingServer, setLoadingServer] = useState(false);
  const [revealStep, setRevealStep] = useState<"idle" | "code">("idle");
  const [revealCode, setRevealCode] = useState("");
  const [revealSending, setRevealSending] = useState(false);
  const [revealVerifying, setRevealVerifying] = useState(false);
  const [theme, setTheme] = useState<ThemeName>("green");

  useEffect(() => {
    if (open) setTheme(getStoredTheme());
  }, [open]);

  const pickTheme = (t: ThemeName) => {
    setTheme(t);
    setStoredTheme(t);
  };

  useEffect(() => {
    if (!open) return;
    setCurrentPin("");
    setNewPin("");
    setConfirmPin("");
    setPinRevealed(false);
    setRevealStep("idle");
    setRevealCode("");
    setLoadingServer(true);
    (async () => {
      const srv = await loadServerCredentials();
      if (srv) {
        setMobile(srv.mobile);
        setAdminMobile(srv.mobile);
        // Do not sync PIN hash from server — user re-enters PIN locally when changing it.
      } else {
        // No server record yet — try to migrate from localStorage
        const localMobile = getAdminMobile();
        const localPin = getAdminPin();
        if (/^\d{11}$/.test(localMobile) && /^\d{4}$/.test(localPin)) {
          const { error } = await saveServerCredentials(localMobile, localPin);
          if (!error) toast.success("পুরনো মোবাইল ও পিন সার্ভারে সিঙ্ক হয়েছে");
        }
        setMobile(localMobile);
      }
      setLoadingServer(false);
    })();
  }, [open]);

  useEffect(() => {
    if (!pinRevealed) return;
    const t = setTimeout(() => setPinRevealed(false), 5000);
    return () => clearTimeout(t);
  }, [pinRevealed]);

  const pinExists = hasAdminPin();

  const requestRevealOtp = async () => {
    const savedPin = getAdminPin();
    const savedMobile = getAdminMobile();
    if (!/^\d{11}$/.test(savedMobile) || !/^\d{4}$/.test(savedPin)) {
      toast.error("আগে মোবাইল ও পিন সেট করুন");
      return;
    }
    setRevealSending(true);
    try {
      await requestSmsOtp({ data: { mobile: savedMobile, pin: savedPin } });
      setRevealStep("code");
      setRevealCode("");
      toast.success("কোড পাঠানো হয়েছে", { description: "আপনার মোবাইলে SMS চেক করুন" });
    } catch (e: any) {
      toast.error("কোড পাঠানো ব্যর্থ", { description: e?.message || "একটু পরে আবার চেষ্টা করুন" });
    } finally {
      setRevealSending(false);
    }
  };

  const verifyRevealOtp = async () => {
    if (!/^\d{6}$/.test(revealCode)) {
      toast.error("৬ ডিজিটের কোড দিন");
      return;
    }
    setRevealVerifying(true);
    try {
      await verifySmsOtp({ data: { mobile: getAdminMobile(), code: revealCode } });
      setPinRevealed(true);
      setRevealStep("idle");
      setRevealCode("");
      toast.success("পিন দেখানো হলো", { description: "৫ সেকেন্ড পর আবার লুকাবে" });
    } catch (e: any) {
      toast.error("কোড ভুল", { description: e?.message || "৬-ডিজিটের কোডটি মিলিয়ে আবার লিখুন" });
    } finally {
      setRevealVerifying(false);
    }
  };


  const handleSave = async () => {
    if (!/^\d{11}$/.test(mobile)) {
      toast.error("মোবাইল নাম্বার ১১ ডিজিটের হতে হবে");
      return;
    }

    const wantsPinChange =
      newPin.length > 0 || confirmPin.length > 0 || (pinExists && currentPin.length > 0);

    let finalPin = getAdminPin();

    if (wantsPinChange) {
      if (pinExists && currentPin !== getAdminPin()) {
        toast.error("বর্তমান পিন ভুল");
        return;
      }
      if (!/^\d{4}$/.test(newPin)) {
        toast.error("নতুন পিন ৪ ডিজিটের হতে হবে");
        return;
      }
      if (newPin !== confirmPin) {
        toast.error("নতুন পিন মিলছে না");
        return;
      }
      finalPin = newPin;
    }

    if (!/^\d{4}$/.test(finalPin)) {
      toast.error("লগইনের জন্য একটি ৪ ডিজিটের পিন সেট করুন");
      return;
    }

    setSaving(true);
    const { error } = await saveServerCredentials(mobile, finalPin);
    setSaving(false);
    if (error) {
      toast.error(error.includes("duplicate") || error.includes("unique")
        ? "এই মোবাইল নাম্বার অন্য একাউন্টে ব্যবহৃত হচ্ছে"
        : error);
      return;
    }

    setAdminMobile(mobile);
    setAdminPin(finalPin);
    toast.success("সেটিংস সংরক্ষিত হয়েছে");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5" /> সেটিংস
          </DialogTitle>
          <DialogDescription>
            মোবাইল ও পিন সার্ভারে সংরক্ষিত হবে — যেকোনো ডিভাইস থেকে এগুলো দিয়ে লগইন করতে পারবেন।
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Palette className="h-4 w-4 text-primary" /> থিম
            </div>
            <p className="text-xs text-muted-foreground">পছন্দের থিম বেছে নিন — পরিবর্তন না করা পর্যন্ত সেভ থাকবে।</p>
            <div className="grid grid-cols-5 gap-2 pt-1">
              {THEME_OPTIONS.map((opt) => {
                const active = theme === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => pickTheme(opt.value)}
                    className={`group flex flex-col items-center gap-1 rounded-xl border p-2 transition ${
                      active ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:bg-accent/40"
                    }`}
                    aria-label={opt.label}
                  >
                    <span
                      className="relative grid h-8 w-8 place-items-center rounded-full ring-1 ring-black/5"
                      style={{ background: opt.swatch }}
                    >
                      {active && <Check className="h-4 w-4 text-white drop-shadow" />}
                    </span>
                    <span className={`text-[10.5px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}>
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5 text-sm">
              <Phone className="h-3.5 w-3.5" /> অ্যাডমিনের মোবাইল
            </Label>
            <Input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={11}
              placeholder="01XXXXXXXXX"
              value={mobile}
              disabled={loadingServer}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 11))}
            />
          </div>

          <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <ShieldCheck className="h-4 w-4 text-primary" /> পিন (৪ ডিজিট)
            </div>
            <p className="text-xs text-muted-foreground">
              {pinExists
                ? "এই পিন লগইন ও ডিলিট দুই জায়গাতেই ব্যবহার হবে। পরিবর্তন করতে নিচের ঘরগুলো পূরণ করুন।"
                : "পিন সেট করলে মোবাইল + পিন দিয়ে লগইন করতে পারবেন এবং ডিলিটের সময়ও এটি চাইবে।"}
            </p>

            {pinExists && (
              <div className="space-y-2 rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-muted-foreground">সেভড পিন</div>
                    <div className="font-mono text-base font-semibold tracking-[0.4em]">
                      {pinRevealed ? getAdminPin() : "••••"}
                    </div>
                  </div>
                  {pinRevealed ? (
                    <button
                      type="button"
                      onClick={() => setPinRevealed(false)}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                    >
                      <EyeOff className="h-3.5 w-3.5" /> লুকান
                    </button>
                  ) : revealStep === "idle" ? (
                    <button
                      type="button"
                      onClick={requestRevealOtp}
                      disabled={revealSending}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
                    >
                      {revealSending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {revealSending ? "পাঠানো হচ্ছে…" : "দেখুন"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setRevealStep("idle");
                        setRevealCode("");
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      বাতিল
                    </button>
                  )}
                </div>

                {revealStep === "code" && !pinRevealed && (
                  <div className="space-y-2 rounded-md border border-primary/20 bg-primary/5 p-2.5 animate-in fade-in slide-in-from-top-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
                      <KeyRound className="h-3.5 w-3.5" />
                      সেভড মোবাইলে পাঠানো ৬-ডিজিট কোড দিন
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        autoComplete="one-time-code"
                        autoFocus
                        placeholder="••••••"
                        className="h-9 text-center font-mono tracking-[0.4em]"
                        value={revealCode}
                        onChange={(e) => setRevealCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        onKeyDown={(e) => e.key === "Enter" && verifyRevealOtp()}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={verifyRevealOtp}
                        disabled={revealVerifying || revealCode.length !== 6}
                      >
                        {revealVerifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "যাচাই"}
                      </Button>
                    </div>
                    <button
                      type="button"
                      onClick={requestRevealOtp}
                      disabled={revealSending}
                      className="text-[11px] text-primary hover:underline disabled:opacity-50"
                    >
                      {revealSending ? "পাঠানো হচ্ছে…" : "কোড আবার পাঠান"}
                    </button>
                  </div>
                )}
              </div>
            )}


            {pinExists && (
              <div className="space-y-1.5">
                <Label className="text-xs">বর্তমান পিন</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="••••"
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">নতুন পিন</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="••••"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">পুনরায় নতুন পিন</Label>
                <Input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="••••"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSave} disabled={saving || loadingServer} className="w-full">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            সংরক্ষণ করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
