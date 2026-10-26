import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { sendBulkSmsToMembers } from "@/lib/bulk-sms.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Send, Search, MessageSquare, CheckCheck, PartyPopper, UserPlus, Wallet } from "lucide-react";
import { taka, toBn } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sms")({
  component: BulkSmsPage,
});

type Member = { id: string; name: string; phone: string | null; role: string | null };

// BulkSMSBD official rates (৳ per SMS part)
const RATES = {
  nonmasking: { gsm: 0.25, unicode: 0.40 },
  masking:    { gsm: 0.40, unicode: 0.60 },
} as const;
type SmsKind = "nonmasking" | "masking";

// GSM-7 basic + extension table check
const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001BÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";
function isGsm7(text: string) {
  for (const ch of text) {
    if (!GSM_BASIC.includes(ch) && !GSM_EXT.includes(ch)) return false;
  }
  return true;
}
function gsmLength(text: string) {
  let len = 0;
  for (const ch of text) len += GSM_EXT.includes(ch) ? 2 : 1;
  return len;
}
function smsParts(text: string) {
  if (!text) return { parts: 0, unicode: false, perPartLimit: 160, used: 0 };
  const unicode = !isGsm7(text);
  if (unicode) {
    const used = [...text].length;
    if (used <= 70) return { parts: 1, unicode, perPartLimit: 70, used };
    return { parts: Math.ceil(used / 67), unicode, perPartLimit: 67, used };
  }
  const used = gsmLength(text);
  if (used <= 160) return { parts: 1, unicode, perPartLimit: 160, used };
  return { parts: Math.ceil(used / 153), unicode, perPartLimit: 153, used };
}

function BulkSmsPage() {
  const { data: members = [], isLoading } = useQuery({
    queryKey: ["members", "sms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id,name,phone,role")
        .order("name");
      if (error) throw error;
      return data as Member[];
    },
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [smsKind, setSmsKind] = useState<SmsKind>("nonmasking");
  const [query, setQuery] = useState("");
  const [sending, setSending] = useState(false);

  const validMembers = useMemo(
    () => members.filter((m) => (m.phone || "").replace(/\D/g, "").length >= 10),
    [members],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.phone || "").includes(q) ||
        (m.role || "").toLowerCase().includes(q),
    );
  }, [members, query]);

  const allSelected = selected.size > 0 && validMembers.every((m) => selected.has(m.id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(validMembers.map((m) => m.id)));
  };
  const toggleOne = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const info = smsParts(message);
  // auto-derive rate from encoding + kind (BulkSMSBD pricing)
  const rate = info.unicode ? RATES[smsKind].unicode : RATES[smsKind].gsm;
  const perRecipient = info.parts * rate;
  const totalCost = perRecipient * selected.size;

  const sendFn = useServerFn(sendBulkSmsToMembers);

  const onSend = async () => {
    if (!message.trim()) return toast.error("ম্যাসেজ লিখুন");
    if (selected.size === 0) return toast.error("সদস্য সিলেক্ট করুন");
    if (!confirm(`${toBn(selected.size)} জনকে SMS পাঠাবেন? আনুমানিক খরচ: ${taka(totalCost)}`)) return;
    setSending(true);
    try {
      const res = await sendFn({ data: { memberIds: Array.from(selected), message } });
      if (res.failed === 0) toast.success(`সফল: ${toBn(res.sent)} জনকে পাঠানো হয়েছে`);
      else toast.warning(`সফল ${toBn(res.sent)}, ব্যর্থ ${toBn(res.failed)}`);
      if (res.failed > 0) {
        const failedNames = res.results.filter((r) => !r.ok).map((r) => `${r.name}: ${r.error}`).join("\n");
        console.warn("Failed SMS:\n" + failedNames);
      }
    } catch (e: any) {
      toast.error(e?.message || "পাঠাতে ব্যর্থ");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">গ্রুপ SMS</h1>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="msg">ম্যাসেজ</Label>
          <div className="flex gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() =>
                setMessage(
                  "প্রিয় {নাম}, Kuakata Multimedia পরিবারে আপনাকে আন্তরিক স্বাগতম! আপনার হাজিরা ও পেমেন্ট হিসাব দেখতে ভিজিট করুন: {প্রোফাইল}",
                )
              }
            >
              <PartyPopper className="mr-1 h-3.5 w-3.5" />
              স্বাগতম
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() =>
                setMessage(
                  "{নাম}, Kuakata Multimedia Finance-এ আপনার নতুন প্রোফাইল তৈরি হয়েছে। হাজিরা, বেতন ও পেমেন্ট হিসাব দেখুন: {প্রোফাইল}",
                )
              }
            >
              <UserPlus className="mr-1 h-3.5 w-3.5" />
              নতুন সদস্য
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-[11px]"
              onClick={() =>
                setMessage(
                  "{নাম}, Kuakata Multimedia Finance-এ আপনার বর্তমান ব্যালেন্স: {ব্যালেন্স}। বিস্তারিত হিসাব দেখুন: {প্রোফাইল}",
                )
              }
            >
              <Wallet className="mr-1 h-3.5 w-3.5" />
              ব্যালেন্স
            </Button>
          </div>
        </div>
        <Textarea
          id="msg"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          placeholder="যেমন: আগামীকাল সকাল ৮টায় শুটিং, লোকেশন: কুয়াকাটা সী-বিচ।"
        />
        <p className="text-[11px] text-muted-foreground">
          {"{নাম}"}, {"{ব্যালেন্স}"} ও {"{প্রোফাইল}"} লিখলে প্রতিটি সদস্যের নিজের নাম, মোট ব্যালেন্স ও প্রোফাইল লিংক অটো বসে যাবে।
        </p>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">
            {info.unicode ? "বাংলা/ইউনিকোড" : "ইংরেজি/GSM"}
          </Badge>
          <span>অক্ষর: {toBn(info.used)}/{toBn(info.perPartLimit)}</span>
          <span>পার্ট: {toBn(info.parts)}</span>
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">SMS টাইপ:</span>
            <div className="inline-flex rounded-md border bg-background p-0.5">
              <button
                type="button"
                onClick={() => setSmsKind("nonmasking")}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${smsKind === "nonmasking" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                Non-masking
              </button>
              <button
                type="button"
                onClick={() => setSmsKind("masking")}
                className={`rounded px-2.5 py-1 text-[11px] font-medium transition ${smsKind === "masking" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                Masking
              </button>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/40 p-2.5 text-xs">
            <div className="flex justify-between">
              <span>প্রতি SMS রেট</span>
              <span className="font-semibold">{taka(rate)} <span className="text-[10px] text-muted-foreground">({info.unicode ? "Unicode" : "GSM"})</span></span>
            </div>
            <div className="flex justify-between">
              <span>পার্ট × রেট</span>
              <span className="font-semibold">{toBn(info.parts)} × {taka(rate)} = {taka(perRecipient)}</span>
            </div>
            <div className="flex justify-between">
              <span>সিলেক্টেড</span>
              <span className="font-semibold">{toBn(selected.size)} জন</span>
            </div>
            <div className="mt-1 flex justify-between border-t pt-1">
              <span>মোট আনুমানিক</span>
              <span className="font-bold text-primary">{taka(totalCost)}</span>
            </div>
          </div>
        </div>


        <Button onClick={onSend} disabled={sending || selected.size === 0 || !message.trim()} className="w-full">
          <Send className="mr-2 h-4 w-4" />
          {sending ? "পাঠানো হচ্ছে..." : `SMS পাঠান (${toBn(selected.size)})`}
        </Button>
      </Card>

      <Card className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="নাম/মোবাইল/পদ খুঁজুন"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
            <CheckCheck className="mr-1 h-4 w-4" />
            {allSelected ? "আনসিলেক্ট" : "সব"}
          </Button>
        </div>

        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">লোড হচ্ছে...</div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">কোন সদস্য নেই</div>
        ) : (
          <ul className="divide-y">
            {filtered.map((m) => {
              const hasPhone = (m.phone || "").replace(/\D/g, "").length >= 10;
              const checked = selected.has(m.id);
              return (
                <li key={m.id} className="flex items-center gap-3 py-2">
                  <Checkbox
                    id={`m-${m.id}`}
                    checked={checked}
                    disabled={!hasPhone}
                    onCheckedChange={() => toggleOne(m.id)}
                  />
                  <label htmlFor={`m-${m.id}`} className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{m.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.phone ? toBn(m.phone) : "মোবাইল নেই"} {m.role ? `• ${m.role}` : ""}
                      </div>
                    </div>
                    {!hasPhone && <Badge variant="destructive" className="shrink-0 text-[10px]">নাম্বার নেই</Badge>}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
