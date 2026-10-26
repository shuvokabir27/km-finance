import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Clapperboard, Plus, Users, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { bnDate, taka, toBn } from "@/lib/format";
import { MemberAvatar } from "@/components/member-avatar";
import { ConfirmDelete } from "@/components/confirm-delete";

type Shoot = { id: string; name: string; shoot_date: string; location: string | null; director: string | null };
type Member = { id: string; name: string; role: string | null; rate: number; type: string; photo_url: string | null };

export function SharedChannelShootings({
  channelName,
  excludedMemberIds,
  onDone,
}: {
  channelName: string;
  excludedMemberIds: string[];
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [attFor, setAttFor] = useState<Shoot | null>(null);
  const [detailFor, setDetailFor] = useState<Shoot | null>(null);

  const { data: shoots = [] } = useQuery({
    queryKey: ["channel-shootings", channelName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date, location, director")
        .eq("channel", channelName)
        .order("shoot_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Shoot[];
    },
  });

  const { data: counts = {} } = useQuery({
    queryKey: ["channel-shooting-counts", channelName, shoots.map((s) => s.id).join(","), excludedMemberIds.join(",")],
    enabled: shoots.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("shooting_id, member_id, members(type)")
        .in("shooting_id", shoots.map((s) => s.id))
        .eq("present", true);
      const rows = (data ?? []) as unknown as {
        shooting_id: string | null; member_id: string; members: { type: string } | null;
      }[];
      const m: Record<string, number> = {};
      for (const r of rows) {
        if (!r.shooting_id) continue;
        if (r.members?.type === "monthly") continue;
        if (excludedMemberIds.includes(r.member_id)) continue;
        m[r.shooting_id] = (m[r.shooting_id] ?? 0) + 1;
      }
      return m;
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["channel-shootings", channelName] });
    qc.invalidateQueries({ queryKey: ["channel-shooting-counts"] });
    qc.invalidateQueries({ queryKey: ["shootings"] });
    onDone();
  };

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("shootings").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("শুটিং মুছে ফেলা হয়েছে"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="rounded-2xl border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <Clapperboard className="h-4 w-4 text-primary" /> শুটিং ও হাজিরা
        </h3>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> নতুন শুটিং
        </Button>
      </div>
      {shoots.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">এই চ্যানেলে এখনো কোনো শুটিং নেই</p>
      ) : (
        <ul className="space-y-1.5">
          {shoots.map((s) => (
            <li key={s.id} className="flex items-center gap-2 rounded-xl border bg-background p-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetailFor(s)}>
                <div className="truncate text-sm font-medium">{s.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {bnDate(s.shoot_date)}
                  {s.location ? ` · ${s.location}` : ""} · উপস্থিত {toBn(counts[s.id] ?? 0)} জন
                </div>
              </button>
              <Button size="sm" variant="outline" onClick={() => setAttFor(s)}>
                <Users className="mr-1 h-3.5 w-3.5" /> হাজিরা
              </Button>
              <ConfirmDelete
                title="শুটিং মুছবেন?"
                description={`"${s.name}" ও এর সব হাজিরা ও খরচ মুছে যাবে।`}
                onConfirm={() => del.mutate(s.id)}
                trigger={
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}
      <CreateShootingDialog open={createOpen} onOpenChange={setCreateOpen} channelName={channelName}
        onCreated={(s) => { refresh(); setAttFor(s); }} />
      {attFor && (
        <AttendanceDialog shoot={attFor} excluded={excludedMemberIds} onClose={() => setAttFor(null)} onDone={refresh} />
      )}
      {detailFor && (
        <ShootDetailDialog shoot={detailFor} excluded={excludedMemberIds} onClose={() => setDetailFor(null)}
          onAttendance={() => { setAttFor(detailFor); setDetailFor(null); }} />
      )}
    </section>
  );
}

function ShootDetailDialog({ shoot, excluded, onClose, onAttendance }: {
  shoot: Shoot; excluded: string[]; onClose: () => void; onAttendance: () => void;
}) {
  const { data: att = [] } = useQuery({
    queryKey: ["shoot-detail-att", shoot.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("member_id, rate_override, members(name, role, rate, type, photo_url)")
        .eq("shooting_id", shoot.id)
        .eq("present", true);
      if (error) throw error;
      return (data ?? []) as unknown as {
        member_id: string; rate_override: number | null;
        members: { name: string; role: string | null; rate: number; type: string; photo_url: string | null } | null;
      }[];
    },
  });

  const { data: exp = [] } = useQuery({
    queryKey: ["shoot-detail-exp", shoot.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shooting_expenses")
        .select("id, amount, note, spent_at")
        .eq("shooting_id", shoot.id)
        .order("spent_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const amountOf = (r: (typeof att)[number]) =>
    r.rate_override != null ? Number(r.rate_override) : Number(r.members?.rate ?? 0);
  const visibleAtt = att.filter(
    (r) => r.members?.type !== "monthly" && !excluded.includes(r.member_id),
  );
  const attTotal = att.reduce((a, r) => a + amountOf(r), 0);
  const expTotal = exp.reduce((a, r) => a + Number(r.amount), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>{shoot.name}</DialogTitle>
        </DialogHeader>
        <p className="text-[11px] text-muted-foreground">
          {bnDate(shoot.shoot_date)}
          {shoot.location ? ` · ${shoot.location}` : ""}
          {shoot.director ? ` · পরিচালক: ${shoot.director}` : ""}
        </p>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/50 p-2">
            <div className="text-[10px] text-muted-foreground">হাজিরা খরচ</div>
            <div className="text-sm font-semibold">{taka(attTotal)}</div>
          </div>
          <div className="rounded-xl bg-muted/50 p-2">
            <div className="text-[10px] text-muted-foreground">অন্যান্য খরচ</div>
            <div className="text-sm font-semibold">{taka(expTotal)}</div>
          </div>
          <div className="rounded-xl bg-muted/50 p-2">
            <div className="text-[10px] text-muted-foreground">মোট খরচ</div>
            <div className="text-sm font-semibold">{taka(attTotal + expTotal)}</div>
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-semibold">উপস্থিত সদস্য ({toBn(visibleAtt.length)} জন)</h4>
            <Button size="sm" variant="outline" onClick={onAttendance}>
              <Users className="mr-1 h-3.5 w-3.5" /> হাজিরা সম্পাদনা
            </Button>
          </div>
          {visibleAtt.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">এই শুটিংয়ে হাজিরা নেই</p>
          ) : (
            <ul className="space-y-1">
              {visibleAtt.map((r) => (
                <li key={r.member_id} className="flex items-center gap-2 rounded-xl border p-2">
                  <MemberAvatar name={r.members?.name ?? "—"} photoUrl={r.members?.photo_url ?? null} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.members?.name ?? "—"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {r.members?.role ?? "—"}{r.members?.type === "monthly" ? " · মাসিক" : ""}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{taka(amountOf(r))}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-1 text-xs font-semibold">অন্যান্য খরচ</h4>
          {exp.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">কোনো খরচ যোগ করা হয়নি</p>
          ) : (
            <ul className="space-y-1">
              {exp.map((e) => (
                <li key={e.id} className="flex items-center gap-2 rounded-xl border p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{e.note || "খরচ"}</div>
                    <div className="text-[11px] text-muted-foreground">{bnDate(String(e.spent_at).slice(0, 10))}</div>
                  </div>
                  <div className="text-sm font-semibold">{taka(Number(e.amount))}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateShootingDialog({ open, onOpenChange, channelName, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; channelName: string; onCreated: (s: Shoot) => void;
}) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [director, setDirector] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("শুটিংয়ের নাম দিন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন করুন");
      const { data, error } = await supabase.from("shootings").insert({
        owner_id: u.user.id, name: name.trim(), shoot_date: date, channel: channelName,
        location: location.trim() || null, director: director.trim() || null,
      }).select("id, name, shoot_date, location, director").single();
      if (error) throw error;
      return data as Shoot;
    },
    onSuccess: (s) => {
      toast.success("শুটিং তৈরি হয়েছে");
      setName(""); setLocation(""); setDirector("");
      onOpenChange(false);
      onCreated(s);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] max-w-md overflow-y-auto rounded-2xl">
        <DialogHeader><DialogTitle>নতুন শুটিং — {channelName}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-3">
          <div className="space-y-1.5"><Label>শুটিংয়ের নাম</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>তারিখ</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>লোকেশন (ঐচ্ছিক)</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>পরিচালক (ঐচ্ছিক)</Label><Input value={director} onChange={(e) => setDirector(e.target.value)} /></div>
          <Button type="submit" className="w-full" disabled={save.isPending}>
            {save.isPending ? "সংরক্ষণ হচ্ছে…" : "শুটিং তৈরি করুন"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceDialog({ shoot, excluded, onClose, onDone }: {
  shoot: Shoot; excluded: string[]; onClose: () => void; onDone: () => void;
}) {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [rates, setRates] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");

  const { data: members = [] } = useQuery({
    queryKey: ["members-for-shared-att"],
    queryFn: async () => {
      const { data, error } = await supabase.from("members").select("id, name, role, rate, type, photo_url").order("name");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["shared-att", shoot.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance").select("member_id, present, rate_override").eq("shooting_id", shoot.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!existing) return;
    setSel(Object.fromEntries(existing.filter((r) => r.present).map((r) => [r.member_id, true])));
    setRates(Object.fromEntries(
      existing.filter((r) => r.present && r.rate_override != null).map((r) => [r.member_id, String(r.rate_override)]),
    ));
  }, [existing]);

  const rateOf = (m: Member) => {
    if (m.type === "monthly") return 0;
    const v = rates[m.id];
    return v === undefined || v === "" ? Number(m.rate) : Number(v);
  };

  const eligible = members.filter(
    (m) => m.type !== "monthly" && !excluded.includes(m.id) && m.name.toLowerCase().includes(q.toLowerCase()),
  );
  const selCount = eligible.filter((m) => sel[m.id]).length;
  const total = members.filter((m) => sel[m.id] && m.type === "daily").reduce((a, m) => a + rateOf(m), 0);

  const save = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন করুন");
      const presentIds = Object.keys(sel).filter((k) => sel[k]);
      const removeIds = (existing ?? []).map((r) => r.member_id).filter((id) => !sel[id]);
      if (removeIds.length) {
        const { error } = await supabase.from("attendance").delete().eq("shooting_id", shoot.id).in("member_id", removeIds);
        if (error) throw error;
      }
      const rows = presentIds.map((id) => {
        const m = members.find((x) => x.id === id);
        return {
          owner_id: u.user!.id, member_id: id, date: shoot.shoot_date, present: true,
          shooting_id: shoot.id, rate_override: m ? rateOf(m) : 0,
        };
      });
      if (rows.length) {
        const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "member_id,date" });
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("হাজিরা সংরক্ষণ হয়েছে"); onDone(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader><DialogTitle>হাজিরা — {shoot.name} ({bnDate(shoot.shoot_date)})</DialogTitle></DialogHeader>
        <Input placeholder="সদস্য খুঁজুন…" value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="text-[11px] text-muted-foreground">মালিক হিসেবে যুক্ত সদস্যরা তালিকায় নেই। একই দিনে অন্য শুটিংয়ে হাজিরা থাকলে সেটি এই শুটিংয়ে সরে আসবে।</p>
        <ul className="space-y-1">
          {eligible.map((m) => (
            <li key={m.id} className={`rounded-xl border ${sel[m.id] ? "border-primary bg-primary/10" : "bg-background"}`}>
              <button type="button" onClick={() => setSel((s) => ({ ...s, [m.id]: !s[m.id] }))}
                className="flex w-full items-center gap-2 p-2 text-left">
                <MemberAvatar name={m.name} photoUrl={m.photo_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.name}</div>
                  <div className="text-[11px] text-muted-foreground">{m.role ?? "—"} · {m.type === "monthly" ? "মাসিক" : taka(m.rate)}</div>
                </div>
                {sel[m.id] && <Check className="h-4 w-4 text-primary" />}
              </button>
              {sel[m.id] && m.type === "daily" && (
                <div className="flex items-center gap-2 px-2 pb-2">
                  <span className="text-[11px] text-muted-foreground">টাকা</span>
                  <Input type="number" inputMode="numeric" className="h-8 w-28"
                    value={rates[m.id] ?? String(m.rate)}
                    onChange={(e) => setRates((r) => ({ ...r, [m.id]: e.target.value }))} />
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="sticky bottom-0 space-y-2 bg-background pt-2">
          <div className="flex justify-between text-xs"><span>উপস্থিত: {toBn(selCount)} জন</span><span>হাজিরা খরচ: {taka(total)}</span></div>
          <Button className="w-full" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "সংরক্ষণ হচ্ছে…" : "হাজিরা সংরক্ষণ করুন"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
