import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { mintMemberSessionForAdmin } from "@/lib/admin-member-view.functions";
import { taka, toBn, bnDate } from "@/lib/format";
import { MemberAvatar } from "@/components/member-avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Users,
  Clapperboard,
  Wallet,
  Phone,
  ExternalLink,
  Handshake,
  ArrowRight,
  X,
  Sparkles,
  Loader2,
  Calendar,
  Tv,
} from "lucide-react";
import { toast } from "sonner";

type FilterTab = "all" | "members" | "shootings" | "payments" | "channels";

type MemberItem = {
  id: string;
  name: string;
  phone: string | null;
  role: string | null;
  type: "daily" | "monthly";
  rate: number | null;
  photo_url: string | null;
};

type ShootingItem = {
  id: string;
  name: string;
  shoot_date: string;
  channel: string | null;
  director: string | null;
};

type PaymentItem = {
  id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  member_id: string;
  member: { name: string; photo_url: string | null } | null;
};

type ChannelItem = {
  id: string;
  name: string;
  is_shared: boolean;
};

const BN_TO_EN: Record<string, string> = {
  "০": "0",
  "১": "1",
  "২": "2",
  "৩": "3",
  "৪": "4",
  "৫": "5",
  "৬": "6",
  "৭": "7",
  "৮": "8",
  "৯": "9",
};

function normalize(str: string): string {
  return (str || "")
    .toLowerCase()
    .replace(/[০-৯]/g, (d) => BN_TO_EN[d] ?? d)
    .trim();
}

export function GlobalSearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [loadingMemberId, setLoadingMemberId] = useState<string | null>(null);

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  // Reset query on close
  useEffect(() => {
    if (!open) {
      setQuery("");
      setTab("all");
    }
  }, [open]);

  // 1. Fetch Members
  const { data: members = [] } = useQuery({
    queryKey: ["global-search-members"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, phone, role, type, rate, photo_url")
        .order("name");
      if (error) throw error;
      return (data ?? []) as MemberItem[];
    },
    staleTime: 1000 * 60 * 3,
  });

  // 2. Fetch Shootings
  const { data: shootings = [] } = useQuery({
    queryKey: ["global-search-shootings"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date, channel, director")
        .order("shoot_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as ShootingItem[];
    },
    staleTime: 1000 * 60 * 3,
  });

  // 3. Fetch Payments
  const { data: payments = [] } = useQuery({
    queryKey: ["global-search-payments"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, paid_at, note, member_id, member:members(name, photo_url)")
        .order("paid_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as PaymentItem[];
    },
    staleTime: 1000 * 60 * 3,
  });

  // 4. Fetch Channels
  const { data: channels = [] } = useQuery({
    queryKey: ["global-search-channels"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, name, is_shared")
        .order("name");
      if (error) throw error;
      return (data ?? []) as ChannelItem[];
    },
    staleTime: 1000 * 60 * 5,
  });

  // Filtered Results
  const q = normalize(query);

  const filteredMembers = useMemo(() => {
    if (!q) return members.slice(0, 6);
    return members.filter((m) => {
      const name = normalize(m.name);
      const phone = normalize(m.phone || "");
      const role = normalize(m.role || "");
      const rate = normalize(String(m.rate || ""));
      return (
        name.includes(q) ||
        phone.includes(q) ||
        role.includes(q) ||
        rate.includes(q)
      );
    });
  }, [members, q]);

  const filteredShootings = useMemo(() => {
    if (!q) return shootings.slice(0, 4);
    return shootings.filter((s) => {
      const name = normalize(s.name);
      const channel = normalize(s.channel || "");
      const director = normalize(s.director || "");
      const date = normalize(s.shoot_date);
      return (
        name.includes(q) ||
        channel.includes(q) ||
        director.includes(q) ||
        date.includes(q)
      );
    });
  }, [shootings, q]);

  const filteredPayments = useMemo(() => {
    if (!q) return payments.slice(0, 4);
    return payments.filter((p) => {
      const amount = normalize(String(p.amount));
      const memberName = normalize(p.member?.name || "");
      const note = normalize(p.note || "");
      const date = normalize(p.paid_at);
      return (
        amount.includes(q) ||
        memberName.includes(q) ||
        note.includes(q) ||
        date.includes(q)
      );
    });
  }, [payments, q]);

  const filteredChannels = useMemo(() => {
    if (!q) return channels.slice(0, 4);
    return channels.filter((c) => normalize(c.name).includes(q));
  }, [channels, q]);

  // Total results count
  const totalMatches =
    filteredMembers.length +
    filteredShootings.length +
    filteredPayments.length +
    filteredChannels.length;

  // Open member financial profile without OTP
  const handleOpenMemberHisab = async (memberId: string) => {
    try {
      setLoadingMemberId(memberId);
      const res = await mintMemberSessionForAdmin({ data: { memberId } });
      if (res?.session) {
        localStorage.setItem(`km-member-session:${memberId}`, res.session);
      }
    } catch (err) {
      console.warn("Could not pre-mint admin session:", err);
    } finally {
      setLoadingMemberId(null);
      onOpenChange(false);
      navigate({
        to: "/p/$memberId",
        params: { memberId },
        search: { t: "" },
      });
    }
  };

  const handleNavigate = (to: string) => {
    onOpenChange(false);
    navigate({ to });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-3xl gap-0 border border-border/80 shadow-2xl bg-card">
        {/* Search Input Bar */}
        <div className="relative flex items-center border-b border-border/70 px-4 py-3 bg-background">
          <Search className="h-5 w-5 text-muted-foreground mr-3 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="সদস্যের নাম, মোবাইল, পেমেন্ট টাকা, শুটিং নাম দিয়ে খুঁজুন..."
            className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground/70"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="grid h-6 w-6 place-items-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground transition cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              ESC
            </kbd>
          )}
        </div>

        {/* Filter Chips / Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b border-border/50 px-4 py-2 bg-muted/20 text-xs no-scrollbar">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={`rounded-full px-3 py-1 font-semibold transition cursor-pointer shrink-0 ${
              tab === "all"
                ? "bg-primary text-white shadow-xs"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            সব ({totalMatches})
          </button>
          <button
            type="button"
            onClick={() => setTab("members")}
            className={`rounded-full px-3 py-1 font-semibold transition cursor-pointer shrink-0 ${
              tab === "members"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            সদস্য ({filteredMembers.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("shootings")}
            className={`rounded-full px-3 py-1 font-semibold transition cursor-pointer shrink-0 ${
              tab === "shootings"
                ? "bg-sky-600 text-white shadow-xs"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            শুটিং ({filteredShootings.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("payments")}
            className={`rounded-full px-3 py-1 font-semibold transition cursor-pointer shrink-0 ${
              tab === "payments"
                ? "bg-rose-600 text-white shadow-xs"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            পেমেন্ট ({filteredPayments.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("channels")}
            className={`rounded-full px-3 py-1 font-semibold transition cursor-pointer shrink-0 ${
              tab === "channels"
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            চ্যানেল ({filteredChannels.length})
          </button>
        </div>

        {/* Search Results Container */}
        <div className="max-h-[62vh] overflow-y-auto p-4 space-y-5">
          {totalMatches === 0 ? (
            <div className="py-12 text-center space-y-2">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-muted/60 text-muted-foreground">
                <Search className="h-6 w-6" />
              </div>
              <div className="text-sm font-bold text-foreground">
                "{query}" সংক্রান্ত কোনো ফলাফল পাওয়া যায়নি
              </div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                সদস্যের নাম, ফোন নম্বর, টাকার অংক (যেমন: 15000), অথবা শুটিংয়ের নাম দিয়ে আবার চেষ্টা করুন।
              </p>
            </div>
          ) : (
            <>
              {/* 1. Members Section */}
              {(tab === "all" || tab === "members") && filteredMembers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-400 px-1">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" /> সদস্যবৃন্দ ({filteredMembers.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleNavigate("/members")}
                      className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-0.5"
                    >
                      সব সদস্য <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredMembers.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2.5 transition hover:border-emerald-400 hover:shadow-2xs group"
                      >
                        <MemberAvatar name={m.name} photoUrl={m.photo_url} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 transition-colors">
                              {m.name}
                            </span>
                            <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.2 text-[9px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200/50">
                              {m.type === "monthly" ? "মাসিক" : "দৈনিক"}
                            </span>
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-0.5">
                            {m.phone && (
                              <span className="flex items-center gap-0.5 truncate font-mono">
                                <Phone className="h-2.5 w-2.5" />
                                {m.phone}
                              </span>
                            )}
                            {m.role && <span>• {m.role}</span>}
                            {m.rate ? <span>• {taka(m.rate)}</span> : null}
                          </div>
                        </div>

                        {/* Action: Open Hisab profile without OTP */}
                        <button
                          type="button"
                          onClick={() => handleOpenMemberHisab(m.id)}
                          disabled={loadingMemberId === m.id}
                          className="shrink-0 rounded-xl bg-emerald-50 hover:bg-emerald-600 hover:text-white dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 px-2.5 py-1 text-[10px] font-bold transition active:scale-95 cursor-pointer"
                          title="সদস্যের হিসাব প্রোফাইল দেখুন"
                        >
                          {loadingMemberId === m.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <span className="flex items-center gap-1">
                              হিসাব <ArrowRight className="h-2.5 w-2.5" />
                            </span>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Shootings Section */}
              {(tab === "all" || tab === "shootings") && filteredShootings.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-sky-700 dark:text-sky-400 px-1">
                    <span className="flex items-center gap-1.5">
                      <Clapperboard className="h-3.5 w-3.5" /> শুটিং তালিকা ({filteredShootings.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleNavigate("/shootings")}
                      className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-0.5"
                    >
                      শুটিং পেজ <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredShootings.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => handleNavigate("/shootings")}
                        className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2.5 transition hover:border-sky-400 hover:shadow-2xs cursor-pointer group"
                      >
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-100 dark:bg-sky-950/50 text-sky-600 transition group-hover:scale-105">
                          <Clapperboard className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-sky-600 transition-colors">
                            {s.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5 truncate">
                            <span>{bnDate(s.shoot_date)}</span>
                            {s.channel && <span>• {s.channel}</span>}
                            {s.director && <span>• {s.director}</span>}
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold text-sky-600 bg-sky-50 dark:bg-sky-950/30 px-2 py-0.5 rounded-full border border-sky-200/50">
                          {bnDate(s.shoot_date)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Payments Section */}
              {(tab === "all" || tab === "payments") && filteredPayments.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-rose-700 dark:text-rose-400 px-1">
                    <span className="flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5" /> পেমেন্ট লেনদেন ({filteredPayments.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleNavigate("/payments")}
                      className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-0.5"
                    >
                      পেমেন্ট পেজ <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredPayments.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleNavigate("/payments")}
                        className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2.5 transition hover:border-rose-400 hover:shadow-2xs cursor-pointer group"
                      >
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-rose-100 dark:bg-rose-950/50 text-rose-600 transition group-hover:scale-105">
                          <Wallet className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-rose-600 transition-colors">
                            {p.member?.name || "সদস্য"}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {bnDate(p.paid_at)} {p.note ? `• ${p.note}` : ""}
                          </div>
                        </div>
                        <span className="shrink-0 text-xs font-black text-rose-600 font-mono">
                          {taka(p.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Channels Section */}
              {(tab === "all" || tab === "channels") && filteredChannels.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-purple-700 dark:text-purple-400 px-1">
                    <span className="flex items-center gap-1.5">
                      <Tv className="h-3.5 w-3.5" /> চ্যানেল ও পার্টনার ({filteredChannels.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleNavigate("/shared-channels")}
                      className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-0.5"
                    >
                      চ্যানেল পেজ <ArrowRight className="h-3 w-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {filteredChannels.map((c) => (
                      <div
                        key={c.id}
                        onClick={() =>
                          handleNavigate(
                            c.is_shared ? "/shared-channels" : "/client-dues"
                          )
                        }
                        className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-2.5 transition hover:border-purple-400 hover:shadow-2xs cursor-pointer group"
                      >
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-purple-100 dark:bg-purple-950/50 text-purple-600 transition group-hover:scale-105">
                          <Handshake className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-100 group-hover:text-purple-600 transition-colors">
                            {c.name}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            {c.is_shared ? "শেয়ার চ্যানেল" : "ক্লায়েন্ট পার্টনার"}
                          </div>
                        </div>
                        <span className="shrink-0 text-[10px] font-semibold text-purple-600">
                          বিস্তারিত →
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Info */}
        <div className="flex items-center justify-between border-t border-border/60 bg-muted/20 px-4 py-2.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>দ্রুত নেভিগেট করুন</span>
            <span>•</span>
            <span>সদস্যের পাশে "হিসাব →" ক্লিক করলে সরাসরি তার প্রোফাইল দেখা যাবে</span>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg px-2.5 py-0.5 hover:bg-muted transition font-semibold cursor-pointer"
          >
            বন্ধ
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
