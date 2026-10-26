import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { bnDate, toBn } from "@/lib/format";
import { Check, X, CalendarCheck, Clapperboard, Trash2, Pencil, Save, History } from "lucide-react";
import { toast } from "sonner";
import { MemberAvatar } from "@/components/member-avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/confirm-delete";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendancePage,
});

type Member = { id: string; name: string; role: string | null; photo_url: string | null; rate: number };
type Shooting = { id: string; name: string; channel: string | null };

function AttendancePage() {
  const qc = useQueryClient();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shootingName, setShootingName] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");


  const { data: members = [] } = useQuery({
    queryKey: ["daily-members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("members").select("id, name, role, photo_url, rate").eq("type", "daily").order("name");
      if (error) throw error;
      return data as Member[];
    },
  });

  const { data: shootingsOnDate = [] } = useQuery({
    queryKey: ["shootings-on", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("shootings").select("id, name, channel").eq("shoot_date", date).order("created_at");
      if (error) throw error;
      return data as Shooting[];
    },
  });

  const selectedShooting = shootingsOnDate.find((s) => s.name === shootingName);
  const selectedChannel = selectedShooting?.channel ?? null;

  // Members who are owners (partners) of the selected shared channel — excluded from attendance
  const { data: excludedIds = [] } = useQuery({
    queryKey: ["shared-channel-owner-members", selectedChannel],
    enabled: !!selectedChannel,
    queryFn: async () => {
      const { data: ch, error: chErr } = await supabase
        .from("channels")
        .select("id")
        .eq("name", selectedChannel!)
        .eq("is_shared", true);
      if (chErr) throw chErr;
      const chIds = (ch ?? []).map((c) => c.id);
      if (chIds.length === 0) return [] as string[];
      const { data: prts, error: pErr } = await supabase
        .from("channel_partners")
        .select("id")
        .in("channel_id", chIds);
      if (pErr) throw pErr;
      const pIds = (prts ?? []).map((p) => p.id);
      if (pIds.length === 0) return [] as string[];
      const { data: pm, error: pmErr } = await supabase
        .from("channel_partner_members")
        .select("member_id")
        .in("partner_id", pIds);
      if (pmErr) throw pmErr;
      return (pm ?? []).map((r) => r.member_id as string);
    },
  });

  const { data: marked = {} } = useQuery({
    queryKey: ["attendance", date],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance").select("member_id, present, shooting_id, rate_override").eq("date", date);
      if (error) throw error;
      const map: Record<string, { present: boolean; shooting_id: string | null; rate_override: number | null }> = {};
      (data ?? []).forEach((r) => { map[r.member_id] = { present: r.present, shooting_id: r.shooting_id, rate_override: r.rate_override as number | null }; });

      return map;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["attendance-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("date, present, shooting_id, member:members(name), shooting:shootings(name)")
        .order("date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Array<{
        date: string;
        present: boolean;
        shooting_id: string | null;
        member: { name: string } | null;
        shooting: { name: string } | null;
      }>;
    },
  });

  const historyByDate = history.reduce((acc, r) => {
    const key = `${r.date}__${r.shooting?.name ?? "—"}`;
    if (!acc[key]) acc[key] = { date: r.date, shooting: r.shooting?.name ?? null, present: [], absent: [] };
    (r.present ? acc[key].present : acc[key].absent).push(r.member?.name ?? "—");
    return acc;
  }, {} as Record<string, { date: string; shooting: string | null; present: string[]; absent: string[] }>);
  const historyGroups = Object.values(historyByDate);

  async function ensureShootingId(name: string): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = shootingsOnDate.find((s) => s.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) throw new Error("লগইন প্রয়োজন");
    const { data, error } = await supabase
      .from("shootings")
      .upsert(
        { owner_id: u.user.id, name: trimmed, shoot_date: date },
        { onConflict: "owner_id,shoot_date,name" },
      )
      .select("id")
      .single();
    if (error) throw error;
    qc.invalidateQueries({ queryKey: ["shootings-on", date] });
    qc.invalidateQueries({ queryKey: ["shootings"] });
    return data.id;
  }

  const mark = useMutation({
    mutationFn: async ({ memberId, present, rate_override }: { memberId: string; present: boolean; rate_override?: number | null }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const shooting_id = await ensureShootingId(shootingName);
      const { error } = await supabase.from("attendance").upsert(
        { owner_id: u.user.id, member_id: memberId, date, present, shooting_id, rate_override: present ? (rate_override ?? null) : null },
        { onConflict: "member_id,date" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", date] });
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["shootings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeAttendance = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("attendance").delete().eq("member_id", memberId).eq("date", date);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance", date] });
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("হাজিরা মুছে ফেলা হয়েছে");
      setEditMember(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editMember, setEditMember] = useState<Member | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [pendingRate, setPendingRate] = useState<Record<string, string>>({});
  const [editRate, setEditRate] = useState<string>("");
  const [historyDate, setHistoryDate] = useState("");

  // Clear pending when date changes
  useEffect(() => { setPending({}); setPendingRate({}); }, [date]);

  // Init editRate when opening dialog
  useEffect(() => {
    if (editMember) {
      const rec = (marked as Record<string, { present: boolean; shooting_id: string | null; rate_override: number | null }>)[editMember.id];
      setEditRate(rec?.rate_override != null ? String(rec.rate_override) : String(editMember.rate ?? ""));
    }
  }, [editMember, marked]);

  const saveAll = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(pending);
      if (entries.length === 0) throw new Error("সেভ করার মতো কিছু নেই");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const shooting_id = await ensureShootingId(shootingName);
      const rows = entries.map(([memberId, present]) => {
        const raw = pendingRate[memberId];
        const num = raw !== undefined && raw !== "" ? Number(raw) : NaN;
        const member = members.find((m) => m.id === memberId);
        const rate_override = present && !Number.isNaN(num) && num !== (member?.rate ?? null) ? num : null;
        return {
          owner_id: u.user!.id,
          member_id: memberId,
          date,
          present,
          shooting_id,
          rate_override,
        };
      });
      const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "member_id,date" });
      if (error) throw error;
      return entries.length;
    },
    onSuccess: (count) => {
      setPending({});
      setPendingRate({});
      qc.invalidateQueries({ queryKey: ["attendance", date] });
      qc.invalidateQueries({ queryKey: ["attendance-history"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["shootings"] });
      toast.success(`${toBn(count)} জনের হাজিরা সেভ হয়েছে`);
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const pendingCount = Object.keys(pending).length;
  const presentCount = Object.values(marked).filter((v) => v.present).length
    + Object.values(pending).filter(Boolean).length;

  const eligibleMembers = members.filter((m) => !excludedIds.includes(m.id));
  const roles = Array.from(new Set(eligibleMembers.map((m) => m.role ?? "—"))).sort();
  const visibleMembers = roleFilter === "all" ? eligibleMembers : eligibleMembers.filter((m) => (m.role ?? "—") === roleFilter);


  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">হাজিরা</h1>
        <p className="text-sm text-muted-foreground">দৈনিক কর্মীদের জন্য</p>
      </div>

      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground">তারিখ</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
            <Clapperboard className="h-3.5 w-3.5" /> শুটিং নির্বাচন করুন
          </label>
          <select
            value={shootingName}
            onChange={(e) => setShootingName(e.target.value)}
            className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={shootingsOnDate.length === 0}
          >
            <option value="">
              {shootingsOnDate.length === 0 ? "এই তারিখে কোনো শুটিং নেই" : "-- শুটিং বাছাই করুন --"}
            </option>
            {shootingsOnDate.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </select>
          {shootingsOnDate.length === 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              শুটিং ট্যাব থেকে এই তারিখে শুটিং তৈরি করুন
            </p>
          )}
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">রোল অনুযায়ী ফিল্টার</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {["all", ...roles].map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRoleFilter(r)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  roleFilter === r
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:border-primary hover:text-primary"
                }`}
              >
                {r === "all" ? "সবাই" : r}
                <span className="ml-1 opacity-70">
                  {toBn(r === "all" ? eligibleMembers.length : eligibleMembers.filter((m) => (m.role ?? "—") === r).length)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{bnDate(date)}</span>
          <span className="font-medium text-success">উপস্থিত: {toBn(presentCount)}/{toBn(eligibleMembers.length)}</span>
        </div>
      </div>


      {!shootingName.trim() ? (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <Clapperboard className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">হাজিরা নেওয়ার জন্য তারিখ ও শুটিং নাম নির্বাচন করুন</p>
        </div>
      ) : eligibleMembers.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <CalendarCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">কোনো দৈনিক কর্মী নেই</p>
        </div>
      ) : null}

      {shootingName.trim() && (
      <div className="space-y-2">
        {visibleMembers.map((m) => {
          const rec = marked[m.id];
          const isMarked = rec !== undefined;
          const pendingVal = pending[m.id];
          const hasPending = pendingVal !== undefined;
          const status = isMarked ? rec!.present : pendingVal;
          return (
            <div
              key={m.id}
              className={`rounded-2xl border bg-card p-3 ${
                hasPending ? "border-primary/60 ring-1 ring-primary/30" : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <MemberAvatar name={m.name} photoUrl={m.photo_url} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{m.name}</div>
                  {m.role ? (
                    <div className="text-xs text-muted-foreground">{m.role}</div>
                  ) : null}
                  <div className="text-[11px] text-muted-foreground">
                    বেতন: ৳{toBn(
                      isMarked && rec!.rate_override != null
                        ? rec!.rate_override
                        : (m.rate ?? 0),
                    )}
                    {isMarked && rec!.rate_override != null && (
                      <span className="ml-1 rounded bg-primary/10 px-1 text-[9.5px] font-medium text-primary">কাস্টম</span>
                    )}
                  </div>
                  {hasPending && (
                    <div className="text-[10.5px] font-medium text-primary">সেভ করা হয়নি</div>
                  )}
                </div>
                {isMarked ? (
                  <button
                    onClick={() => setEditMember(m)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                      status
                        ? "border-success bg-success/10 text-success"
                        : "border-destructive bg-destructive/10 text-destructive"
                    }`}
                  >
                    {status ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    {status ? "উপস্থিত" : "অনুপস্থিত"}
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPending((p) => ({ ...p, [m.id]: true }))}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                        pendingVal === true
                          ? "border-success bg-success text-success-foreground"
                          : "border-border text-muted-foreground hover:border-success hover:text-success"
                      }`}
                      aria-label="উপস্থিত"
                    >
                      <Check className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => {
                        setPending((p) => ({ ...p, [m.id]: false }));
                        setPendingRate((r) => { const n = { ...r }; delete n[m.id]; return n; });
                      }}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${
                        pendingVal === false
                          ? "border-destructive bg-destructive text-destructive-foreground"
                          : "border-border text-muted-foreground hover:border-destructive hover:text-destructive"
                      }`}
                      aria-label="অনুপস্থিত"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                )}
              </div>
              {pendingVal === true && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-[11px] font-medium text-muted-foreground">আজকের বেতন</label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder={String(m.rate ?? 0)}
                    value={pendingRate[m.id] ?? ""}
                    onChange={(e) => setPendingRate((r) => ({ ...r, [m.id]: e.target.value }))}
                    className="h-8 flex-1 text-sm"
                  />
                  <span className="text-[11px] text-muted-foreground">৳ (ডিফল্ট ৳{toBn(m.rate ?? 0)})</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      )}



      {pendingCount > 0 && (
        <div className="sticky bottom-20 z-10 flex gap-2">
          <Button
            variant="outline"
            onClick={() => setPending({})}
            disabled={saveAll.isPending}
            className="flex-1"
          >
            বাতিল
          </Button>
          <Button
            onClick={() => saveAll.mutate()}
            disabled={saveAll.isPending}
            className="flex-[2] gap-2 shadow-lg"
          >
            <Save className="h-4 w-4" />
            {saveAll.isPending ? "সেভ হচ্ছে..." : `হাজিরা সেভ করুন (${toBn(pendingCount)})`}
          </Button>
        </div>
      )}

      <div className="space-y-3 pt-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-bold">হাজিরার ইতিহাস</h2>
          </div>
          {historyDate && (
            <button
              onClick={() => setHistoryDate("")}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              সব দেখুন
            </button>
          )}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">তারিখ অনুযায়ী দেখুন</label>
          <Input
            type="date"
            value={historyDate}
            onChange={(e) => setHistoryDate(e.target.value)}
            className="mt-1"
          />
        </div>
        {(() => {
          const filtered = historyDate
            ? historyGroups.filter((g) => g.date === historyDate)
            : historyGroups;
          if (filtered.length === 0) {
            return (
              <div className="rounded-2xl border border-dashed bg-card p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {historyDate ? `${bnDate(historyDate)} তারিখে কোনো হাজিরা নেই` : "এখনো কোনো হাজিরার রেকর্ড নেই"}
                </p>
              </div>
            );
          }
          return (
            <div className="space-y-2">
              {filtered.map((g, i) => (
                <details key={i} className="group rounded-2xl border bg-card" open={!!historyDate}>
                  <summary className="flex cursor-pointer items-center justify-between gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{bnDate(g.date)}</div>
                      {g.shooting && (
                        <div className="truncate text-[11px] text-muted-foreground flex items-center gap-1">
                          <Clapperboard className="h-3 w-3" /> {g.shooting}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-semibold text-success">
                        <Check className="inline h-3 w-3" /> {toBn(g.present.length)}
                      </span>
                      <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                        <X className="inline h-3 w-3" /> {toBn(g.absent.length)}
                      </span>
                    </div>
                  </summary>
                  <div className="border-t px-3 py-2 text-xs space-y-1.5">
                    {g.present.length > 0 && (
                      <div>
                        <span className="font-medium text-success">উপস্থিত: </span>
                        <span className="text-muted-foreground">{g.present.join("，")}</span>
                      </div>
                    )}
                    {g.absent.length > 0 && (
                      <div>
                        <span className="font-medium text-destructive">অনুপস্থিত: </span>
                        <span className="text-muted-foreground">{g.absent.join("，")}</span>
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>
          );
        })()}
      </div>



      <Dialog open={!!editMember} onOpenChange={(o) => !o && setEditMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" /> হাজিরা এডিট
            </DialogTitle>
          </DialogHeader>
          {editMember && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3">
                <MemberAvatar name={editMember.name} photoUrl={editMember.photo_url} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{editMember.name}</div>
                  <div className="text-xs text-muted-foreground">{bnDate(date)}</div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">
                  আজকের বেতন (ডিফল্ট ৳{toBn(editMember.rate ?? 0)})
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={editRate}
                  onChange={(e) => setEditRate(e.target.value)}
                  placeholder={String(editMember.rate ?? 0)}
                />
              </div>
              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">অবস্থা পরিবর্তন</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const num = editRate !== "" ? Number(editRate) : NaN;
                      const ro = !Number.isNaN(num) && num !== (editMember.rate ?? null) ? num : null;
                      mark.mutate({ memberId: editMember.id, present: true, rate_override: ro });
                      setEditMember(null);
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition ${
                      marked[editMember.id]?.present
                        ? "border-success bg-success text-success-foreground"
                        : "border-border hover:border-success hover:text-success"
                    }`}
                  >
                    <Check className="h-4 w-4" /> উপস্থিত
                  </button>
                  <button
                    onClick={() => { mark.mutate({ memberId: editMember.id, present: false, rate_override: null }); setEditMember(null); }}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 text-sm font-medium transition ${
                      marked[editMember.id]?.present === false
                        ? "border-destructive bg-destructive text-destructive-foreground"
                        : "border-border hover:border-destructive hover:text-destructive"
                    }`}
                  >
                    <X className="h-4 w-4" /> অনুপস্থিত
                  </button>
                </div>
              </div>

            </div>
          )}
          <DialogFooter>
            <ConfirmDelete
              trigger={
                <Button variant="destructive" className="gap-2">
                  <Trash2 className="h-4 w-4" /> হাজিরা ডিলিট
                </Button>
              }
              title="হাজিরা ডিলিট করবেন?"
              description={editMember ? `${editMember.name}-এর ${bnDate(date)} তারিখের হাজিরা মুছে ফেলা হবে।` : ""}
              relatedItems={["এই দিনের জন্য কর্মীর প্রাপ্য টাকার হিসাব ব্যালেন্স থেকে কমে যাবে"]}
              onConfirm={() => { if (editMember) removeAttendance.mutate(editMember.id); }}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
