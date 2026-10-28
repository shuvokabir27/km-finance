import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestMemberOtp, verifyMemberOtp } from "@/lib/member-otp.functions";
import { AlertCircle, Lock } from "lucide-react";
import { toBn } from "@/lib/format";

export function MemberOtpGate({
  memberId,
  error,
  onLogin,
}: {
  memberId?: string;
  error: string | null;
  onLogin: (session: string, memberId: string) => void;
}) {
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);
  const [limitErrorMessage, setLimitErrorMessage] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: () => requestMemberOtp({ data: { mobile, memberId } }),
    onSuccess: (r) => {
      setSent(r.masked);
      setLimitErrorMessage(null);
      if (r.remainingToday !== undefined) {
        setRemainingToday(r.remainingToday);
        const remMsg =
          r.remainingToday > 0
            ? `কোড পাঠানো হয়েছে (আজ আর ${toBn(r.remainingToday)}টি বাকি)`
            : "কোড পাঠানো হয়েছে (আজকের এটিই শেষ OTP)";
        toast.success(remMsg);
      } else {
        toast.success("কোড পাঠানো হয়েছে");
      }
    },
    onError: (e: Error) => {
      if (
        e.message.includes("লিমিট শেষ") ||
        e.message.includes("limit is end") ||
        e.message.includes("আগামীকাল")
      ) {
        setLimitErrorMessage(e.message);
      }
      toast.error(e.message);
    },
  });

  const verify = useMutation({
    mutationFn: () => verifyMemberOtp({ data: { mobile, code } }),
    onSuccess: (r) => {
      if (memberId && r.memberId !== memberId) {
        toast.error("এই নম্বরটি এই প্রফাইলের নয়");
        return;
      }
      onLogin(r.session, r.memberId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isLimitEnded = !!limitErrorMessage;

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border bg-card p-6 shadow-sm">
        <div className="text-center">
          <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">সদস্য লগইন</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            আপনার মোবাইল নম্বর দিন, ফোনে আসা কোড দিয়ে প্রফাইলে ঢুকুন।
          </p>
        </div>

        {error && !error.includes("লগইন প্রয়োজন") && (
          <p className="text-center text-xs text-destructive">{error}</p>
        )}

        {isLimitEnded && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3.5 text-center text-xs text-destructive animate-in fade-in">
            <AlertCircle className="mx-auto mb-1.5 h-6 w-6 text-destructive" />
            <div className="font-bold">আজকের OTP লিমিট শেষ!</div>
            <div className="mt-1 leading-relaxed">{limitErrorMessage}</div>
          </div>
        )}

        <div className="space-y-1.5">
          <Input
            inputMode="numeric"
            placeholder="01XXXXXXXXX"
            value={mobile}
            disabled={!!sent}
            onChange={(e) => {
              setMobile(e.target.value.replace(/\D/g, "").slice(0, 11));
              setLimitErrorMessage(null);
            }}
            className="h-11 rounded-xl text-center font-mono text-base tracking-wider"
          />
          {!sent && (
            <p className="text-center text-[11px] text-muted-foreground">
              দৈনিক সর্বোচ্চ ২টি OTP পাঠানো যাবে
            </p>
          )}
        </div>

        {!sent ? (
          <Button
            className="w-full h-11 rounded-xl font-bold shadow-sm"
            disabled={mobile.length !== 11 || send.isPending || isLimitEnded}
            onClick={() => send.mutate()}
          >
            {send.isPending ? "পাঠানো হচ্ছে…" : isLimitEnded ? "আজকের লিমিট শেষ" : "OTP পাঠান"}
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl bg-primary/5 p-3 text-center text-xs text-muted-foreground border border-primary/10">
              <span className="font-semibold text-foreground">{sent}</span> নম্বরে ৬ ডিজিটের কোড পাঠানো হয়েছে।
              {remainingToday !== null && (
                <div className="mt-1 text-[11px] text-primary font-medium">
                  {remainingToday > 0
                    ? `(আজ আর ${toBn(remainingToday)}টি OTP পাঠানো যাবে)`
                    : "(আজকের জন্য এটিই শেষ OTP)"}
                </div>
              )}
            </div>

            <Input
              inputMode="numeric"
              placeholder="৬ ডিজিটের কোড"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-11 rounded-xl text-center font-mono text-lg tracking-widest"
            />

            <Button
              className="w-full h-11 rounded-xl font-bold shadow-sm"
              disabled={code.length !== 6 || verify.isPending}
              onClick={() => verify.mutate()}
            >
              {verify.isPending ? "যাচাই হচ্ছে…" : "লগইন"}
            </Button>

            <button
              type="button"
              className="w-full text-xs text-muted-foreground hover:underline text-center"
              onClick={() => {
                setSent(null);
                setCode("");
                setLimitErrorMessage(null);
              }}
            >
              নম্বর বদলান / আবার কোড নিন
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

