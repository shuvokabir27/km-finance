import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestMemberOtp, verifyMemberOtp } from "@/lib/member-otp.functions";

export function MemberOtpGate({ memberId, error, onLogin }: { memberId?: string; error: string | null; onLogin: (session: string, memberId: string) => void }) {
  const [mobile, setMobile] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () => requestMemberOtp({ data: { mobile, memberId } }),
    onSuccess: (r) => { setSent(r.masked); toast.success("কোড পাঠানো হয়েছে"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const verify = useMutation({
    mutationFn: () => verifyMemberOtp({ data: { mobile, code } }),
    onSuccess: (r) => {
      if (memberId && r.memberId !== memberId) { toast.error("এই নম্বরটি এই প্রফাইলের নয়"); return; }
      onLogin(r.session, r.memberId);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
        <div className="text-center">
          <h1 className="text-xl font-bold">সদস্য লগইন</h1>
          <p className="mt-1 text-sm text-muted-foreground">আপনার মোবাইল নম্বর দিন, ফোনে আসা কোড দিয়ে প্রফাইলে ঢুকুন।</p>
        </div>
        {error && !error.includes("লগইন প্রয়োজন") && <p className="text-center text-sm text-destructive">{error}</p>}
        <Input inputMode="numeric" placeholder="01XXXXXXXXX" value={mobile} disabled={!!sent}
          onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 11))} />
        {!sent ? (
          <Button className="w-full" disabled={mobile.length !== 11 || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? "পাঠানো হচ্ছে…" : "OTP পাঠান"}
          </Button>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{sent} নম্বরে ৬ ডিজিটের কোড পাঠানো হয়েছে।</p>
            <Input inputMode="numeric" placeholder="৬ ডিজিটের কোড" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <Button className="w-full" disabled={code.length !== 6 || verify.isPending} onClick={() => verify.mutate()}>
              {verify.isPending ? "যাচাই হচ্ছে…" : "লগইন"}
            </Button>
            <button className="w-full text-xs text-muted-foreground underline" onClick={() => { setSent(null); setCode(""); }}>
              নম্বর বদলান / আবার কোড নিন
            </button>
          </>
        )}
      </div>
    </div>
  );
}

