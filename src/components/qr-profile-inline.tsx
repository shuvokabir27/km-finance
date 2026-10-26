import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Download, Share2, Copy, Check, QrCode, RefreshCw, Link2Off, CalendarRange } from "lucide-react";
import { toast } from "sonner";
import { bnDate } from "@/lib/format";

type ShareRow = {
  share_token: string | null;
  share_enabled: boolean;
  share_from: string | null;
  share_to: string | null;
};

function genToken() {
  const arr = new Uint8Array(18);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/[+/=]/g, "").slice(0, 22);
}

export function QrProfileInline({ memberId, memberName }: { memberId: string; memberName: string }) {
  const qc = useQueryClient();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: share } = useQuery({
    queryKey: ["member-share", memberId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("share_token, share_enabled, share_from, share_to")
        .eq("id", memberId)
        .maybeSingle();
      if (error) throw error;
      return (data ?? { share_token: null, share_enabled: false, share_from: null, share_to: null }) as ShareRow;
    },
  });

  useEffect(() => {
    setFrom(share?.share_from ?? "");
    setTo(share?.share_to ?? "");
  }, [share?.share_from, share?.share_to]);

  const enabled = !!share?.share_enabled && !!share?.share_token;
  const url =
    enabled && typeof window !== "undefined"
      ? `${window.location.origin}/p/${memberId}?t=${share!.share_token}`
      : "";

  useEffect(() => {
    if (!url) { setDataUrl(null); return; }
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "H",
      width: 720,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then(setDataUrl).catch(() => setDataUrl(null));
  }, [url]);

  const update = useMutation({
    mutationFn: async (patch: Partial<ShareRow>) => {
      const { error } = await supabase.from("members").update(patch).eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["member-share", memberId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleEnabled = (on: boolean) => {
    if (on && !share?.share_token) {
      update.mutate({ share_enabled: true, share_token: genToken() });
      toast.success("লিংক চালু হয়েছে");
    } else {
      update.mutate({ share_enabled: on });
      toast.success(on ? "লিংক চালু হয়েছে" : "লিংক বন্ধ হয়েছে");
    }
  };

  const regenerate = () => {
    update.mutate({ share_token: genToken(), share_enabled: true });
    toast.success("নতুন লিংক তৈরি হয়েছে — আগেরটি আর কাজ করবে না");
  };

  const saveRange = () => {
    if (from && to && from > to) {
      toast.error("শুরুর তারিখ শেষের পরে হতে পারবে না");
      return;
    }
    update.mutate({ share_from: from || null, share_to: to || null });
    toast.success("তারিখের পরিসর সংরক্ষণ হয়েছে");
  };

  const clearRange = () => {
    setFrom(""); setTo("");
    update.mutate({ share_from: null, share_to: null });
    toast.success("পরিসর সরানো হয়েছে — সব তারিখের হিসাব দেখাবে");
  };

  const download = () => {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${memberName.replace(/\s+/g, "-")}-QR.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("লিঙ্ক কপি হয়েছে");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("কপি করা যায়নি");
    }
  };

  const share_ = async () => {
    if (!url) return;
    if (navigator.share) {
      try { await navigator.share({ title: `${memberName} — প্রফাইল`, url }); } catch {/* cancelled */}
    } else {
      copy();
    }
  };

  const dirty = (from || "") !== (share?.share_from ?? "") || (to || "") !== (share?.share_to ?? "");

  return (
    <div className="w-full min-w-0 space-y-2.5 overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-b from-emerald-50/70 to-white p-3 sm:space-y-3 sm:p-4 dark:from-emerald-950/30 dark:to-zinc-900/40 dark:border-emerald-900/30">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800/80 dark:text-emerald-200/80">
          <QrCode className="h-4 w-4" /> ব্যক্তিগত লিংক
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10.5px] text-muted-foreground">{enabled ? "চালু" : "বন্ধ"}</span>
          <Switch checked={enabled} onCheckedChange={toggleEnabled} disabled={update.isPending} />
        </div>
      </div>

      {enabled ? (
        <>
          <div className="rounded-xl border bg-card/70 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <CalendarRange className="h-3.5 w-3.5" /> তারিখের পরিসর (ঐচ্ছিক)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground">শুরু</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground">শেষ</label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 text-xs" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 flex-1 text-xs" onClick={saveRange} disabled={!dirty || update.isPending}>
                সংরক্ষণ
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={clearRange} disabled={update.isPending || (!share?.share_from && !share?.share_to)}>
                সব
              </Button>
            </div>
            {(share?.share_from || share?.share_to) && (
              <div className="text-[10.5px] text-muted-foreground">
                বর্তমান: {share?.share_from ? bnDate(share.share_from) : "শুরু থেকে"} — {share?.share_to ? bnDate(share.share_to) : "এখন পর্যন্ত"}
              </div>
            )}
          </div>

          <div className="mx-auto grid aspect-square w-[clamp(180px,54vw,210px)] max-w-[calc(100%-1rem)] place-items-center rounded-xl bg-white p-2.5 shadow-inner ring-1 ring-emerald-100 sm:w-[240px] sm:p-3">
            {dataUrl ? (
              <img src={dataUrl} alt={`${memberName} QR কোড`} className="h-full w-full object-contain" />
            ) : (
              <div className="text-xs text-muted-foreground">QR তৈরি হচ্ছে…</div>
            )}
          </div>
          <p className="text-center text-[10.5px] leading-snug text-muted-foreground sm:text-[11px]">
            শুধু এই লিংক/QR যিনি পাবেন, তিনিই হিসাব দেখতে পাবেন। যেকোনো সময় বন্ধ করতে পারবেন।
          </p>
          <div className="flex w-full min-w-0 items-center gap-2 rounded-xl border bg-card px-2.5 py-2 text-[11px]">
            <span className="min-w-0 flex-1 truncate font-mono">{url}</span>
            <button onClick={copy} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary" aria-label="কপি">
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 [&_button]:min-w-0 [&_button]:px-2">
            <Button onClick={download} disabled={!dataUrl} size="sm">
              <Download className="mr-1 h-4 w-4" /> ডাউনলোড
            </Button>
            <Button variant="outline" onClick={share_} size="sm">
              <Share2 className="mr-1 h-4 w-4" /> শেয়ার
            </Button>
            <Button variant="outline" onClick={regenerate} size="sm" disabled={update.isPending}>
              <RefreshCw className="mr-1 h-4 w-4" /> রিসেট
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/50 p-5 text-center">
          <Link2Off className="h-6 w-6 text-muted-foreground" />
          <div className="text-xs text-muted-foreground">
            লিংক বন্ধ আছে। চালু করলে সদস্য তার হিসাব দেখতে পাবেন।
          </div>
          <Button size="sm" onClick={() => toggleEnabled(true)} disabled={update.isPending}>
            লিংক তৈরি ও চালু করুন
          </Button>
        </div>
      )}
    </div>
  );
}
