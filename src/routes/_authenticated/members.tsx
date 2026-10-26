import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Phone, User as UserIcon, CalendarPlus, Camera, Pencil, ChevronRight, UserRoundSearch } from "lucide-react";
import { taka, toBn } from "@/lib/format";
import { toast } from "sonner";
import { MemberAvatar, MEMBER_PHOTO_BUCKET } from "@/components/member-avatar";
import { MemberAccounts } from "@/components/member-accounts";
import { MemberMonthlyHistory } from "@/components/member-monthly-history";
import { BonusSection } from "@/components/bonus-section";
import { MemberHistory } from "@/components/member-history";
import { mintMemberSessionForAdmin } from "@/lib/admin-member-view.functions";


import { ConfirmDelete } from "@/components/confirm-delete";
import { PhoneInputBD } from "@/components/phone-input-bd";
import { QrProfileInline } from "@/components/qr-profile-inline";

export const Route = createFileRoute("/_authenticated/members")({
  component: MembersPage,
});

type Member = { id: string; name: string; phone: string | null; role: string | null; type: "daily" | "monthly"; rate: number; photo_url: string | null };

function MembersPage() {
  const qc = useQueryClient();
  const { data: members = [], isLoading } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data, error } = await supabase.from("members").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Member[];
    },
  });

  const balances = useQuery({
    queryKey: ["balances", members.map((m) => m.id).join(",")],
    enabled: members.length > 0,
    queryFn: async () => {
      const out: Record<string, number> = {};
      await Promise.all(
        members.map(async (m) => {
          const { data } = await supabase.rpc("member_balance", { _member_id: m.id });
          out[m.id] = Number(data ?? 0);
        }),
      );
      return out;
    },
  });

  const remove = useMutation({
    mutationFn: async (m: Member) => {
      if (m.photo_url) {
        await supabase.storage.from(MEMBER_PHOTO_BUCKET).remove([m.photo_url]);
      }
      const { error } = await supabase.from("members").delete().eq("id", m.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("সদস্য মুছে ফেলা হয়েছে");
    },
  });

  const addMonthly = useMutation({
    mutationFn: async (m: Member) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      const { error } = await supabase.from("monthly_salaries").insert({
        owner_id: u.user.id,
        member_id: m.id,
        month,
        amount: m.rate,
      });
      if (error) {
        if (error.code === "23505") throw new Error("এই মাসের বেতন আগেই যোগ করা হয়েছে");
        throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["monthly-exists"] });
      qc.invalidateQueries({ queryKey: ["member-monthly-history"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("মাসিক বেতন ব্যালেন্সে যুক্ত হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changePhoto = useMutation({
    mutationFn: async ({ member, file }: { member: Member; file: File }) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${u.user.id}/${member.id}-${Date.now()}.${ext}`;
      const up = await supabase.storage.from(MEMBER_PHOTO_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (up.error) throw up.error;
      if (member.photo_url) {
        await supabase.storage.from(MEMBER_PHOTO_BUCKET).remove([member.photo_url]);
      }
      const { error } = await supabase.from("members").update({ photo_url: path }).eq("id", member.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      toast.success("ছবি আপডেট হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">সদস্য তালিকা</h1>
          <p className="text-sm text-muted-foreground">{toBn(members.length)} জন সদস্য</p>
        </div>
        <AddMemberDialog />
      </div>

      {isLoading && <div className="py-10 text-center text-muted-foreground">লোড হচ্ছে…</div>}

      {!isLoading && members.length === 0 && (
        <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
          <UserIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">এখনও কোনো সদস্য যোগ করা হয়নি</p>
        </div>
      )}

      <div className="space-y-2">
        {[...members]
          .sort((a, b) => {
            const pinned = "kabir hossen shuvo";
            const aPin = a.name.trim().toLowerCase() === pinned;
            const bPin = b.name.trim().toLowerCase() === pinned;
            if (aPin && !bPin) return -1;
            if (bPin && !aPin) return 1;
            return (balances.data?.[b.id] ?? 0) - (balances.data?.[a.id] ?? 0);
          })
          .map((m) => (
            <MemberDetailDialog
              key={m.id}
              member={m}
              balance={balances.data?.[m.id] ?? 0}
              onRemove={() => remove.mutate(m)}
              onAddMonthly={() => addMonthly.mutate(m)}
              addMonthlyPending={addMonthly.isPending}
              onChangePhoto={(file) => changePhoto.mutate({ member: m, file })}
            />
          ))}
      </div>


    </div>
  );
}

function MemberDetailDialog({
  member: m,
  balance,
  onRemove,
  onAddMonthly,
  addMonthlyPending,
  onChangePhoto,
}: {
  member: Member;
  balance: number;
  onRemove: () => void;
  onAddMonthly: () => void;
  addMonthlyPending: boolean;
  onChangePhoto: (file: File) => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: shareBalances = [] } = useQuery({
    queryKey: ["member-share-balances", m.id],
    enabled: open,
    queryFn: async () => {
      const { data: chans, error } = await supabase
        .from("channels")
        .select("id, name")
        .eq("is_shared", true)
        .order("name");
      if (error) throw error;
      const rows = await Promise.all(
        (chans ?? []).map(async (c) => {
          const { data } = await supabase.rpc("member_balance", { _member_id: m.id, _channel_id: c.id });
          return { name: c.name as string, amount: Number(data ?? 0) };
        }),
      );
      return rows.filter((r) => r.amount !== 0);
    },
  });
  const shareTotal = shareBalances.reduce((s, r) => s + r.amount, 0);
  const totalBalance = balance + shareTotal;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition hover:bg-accent/40 active:scale-[0.99]"
        >
          <MemberAvatar name={m.name} photoUrl={m.photo_url} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold">{m.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.type === "daily" ? "bg-warning/15 text-warning-foreground" : "bg-primary/10 text-primary"}`}>
                {m.type === "daily" ? "দৈনিক" : "মাসিক"}
              </span>
            </div>
            {m.role && <div className="truncate text-xs text-muted-foreground">{m.role}</div>}
            <div className="mt-1 text-xs text-muted-foreground">
              ব্যালেন্স: <b className={balance > 0 ? "text-success" : "text-foreground"}>{taka(balance)}</b>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[88dvh] max-w-md overflow-y-auto overflow-x-hidden rounded-2xl">
        <DialogHeader><DialogTitle>সদস্যের প্রোফাইল</DialogTitle></DialogHeader>
        <div className="w-full min-w-0 space-y-4 overflow-hidden">
          <div className="min-w-0 overflow-hidden flex flex-col items-center gap-2 text-center">
            <PhotoPicker member={m} onPick={onChangePhoto} />
            <div>
              <div className="flex min-w-0 items-center justify-center gap-2">
                <h2 className="min-w-0 truncate text-lg font-bold">{m.name}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.type === "daily" ? "bg-warning/15 text-warning-foreground" : "bg-primary/10 text-primary"}`}>
                  {m.type === "daily" ? "দৈনিক" : "মাসিক"}
                </span>
              </div>
              {m.role && <div className="text-xs text-muted-foreground">{m.role}</div>}
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2">
            <InfoBox label="রেট" value={`${taka(m.rate)}${m.type === "daily" ? "/দিন" : "/মাস"}`} />
            <InfoBox
              label="মোট ব্যালেন্স"
              value={taka(totalBalance)}
              valueClass={totalBalance > 0 ? "text-success" : ""}
            />
          </div>

          {shareTotal !== 0 && (
            <div className="min-w-0 space-y-1 rounded-xl border bg-muted/30 px-3 py-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">সাধারণ হিসাব</span>
                <b>{taka(balance)}</b>
              </div>
              {shareBalances.map((r) => (
                <div key={r.name} className="flex items-center justify-between">
                  <span className="min-w-0 truncate text-muted-foreground">{r.name}</span>
                  <b>{taka(r.amount)}</b>
                </div>
              ))}
            </div>
          )}


          {m.phone && (
            <a
              href={`tel:${m.phone}`}
              className="flex min-w-0 items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-sm"
            >
              <Phone className="h-4 w-4 text-primary" />
              <span className="min-w-0 flex-1 truncate">{toBn(m.phone)}</span>
              <span className="text-xs text-primary">কল</span>
            </a>
          )}

          {m.type === "monthly" && m.rate > 0 && (
            <MonthlySalaryButton member={m} onAdd={onAddMonthly} pending={addMonthlyPending} />
          )}

          <BonusSection memberId={m.id} />

          <MemberHistory memberId={m.id} memberRate={m.rate} />


          <MemberMonthlyHistory member={m} />

          <QrProfileInline memberId={m.id} memberName={m.name} />

          <MemberViewButton memberId={m.id} />



          <div className="flex gap-2 pt-1">
            <EditMemberDialog member={m} fullWidth />
            <ConfirmDelete
              trigger={
                <Button
                  variant="outline"
                  className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="mr-1.5 h-4 w-4" /> মুছুন
                </Button>
              }
              title={`${m.name} সদস্যকে ডিলিট করবেন?`}
              description={`"${m.name}" সদস্যকে স্থায়ীভাবে ডিলিট করা হবে।`}
              relatedItems={[
                "এই সদস্যের সকল হাজিরা",
                "সকল পেমেন্ট ও বকেয়া হিসাব",
                "সকল মাসিক বেতনের রেকর্ড",
                "সকল বোনাসের তথ্য",
                "ব্যাংক ও অ্যাকাউন্টের তথ্য",
              ]}
              onConfirm={() => {
                onRemove();
                setOpen(false);
              }}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberViewButton({ memberId }: { memberId: string }) {
  const navigate = useNavigate();
  const view = useMutation({
    mutationFn: async () => {
      const res = await mintMemberSessionForAdmin({ data: { memberId } });
      return res.session;
    },
    onSuccess: (session) => {
      localStorage.setItem(`km-member-session:${memberId}`, session);
      navigate({ to: "/p/$memberId", params: { memberId }, search: { t: "" } });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      type="button"
      onClick={() => view.mutate()}
      disabled={view.isPending}
      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition hover:bg-primary/15 disabled:opacity-50"
    >
      <UserRoundSearch className="h-4 w-4" />
      {view.isPending ? "খুলছে…" : "সদস্যের ভিউ দেখুন"}
    </button>
  );
}

function InfoBox({ label, value, valueClass = "" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 px-3 py-2">
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-bold ${valueClass}`}>{value}</div>
    </div>
  );
}

function MonthlySalaryButton({ member, onAdd, pending }: { member: Member; onAdd: () => void; pending: boolean }) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const { data: exists, isLoading } = useQuery({
    queryKey: ["monthly-exists", member.id, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_salaries")
        .select("id")
        .eq("member_id", member.id)
        .eq("month", month)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
  });
  const added = !!exists;
  return (
    <button
      onClick={onAdd}
      disabled={pending || isLoading || added}
      className={`flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed ${
        added
          ? "border-success/30 bg-success/10 text-success disabled:opacity-100"
          : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 disabled:opacity-50"
      }`}
    >
      {added ? (
        <><CheckCircle2 className="h-4 w-4" /> এই মাসের বেতন যুক্ত আছে</>
      ) : (
        <><CalendarPlus className="h-4 w-4" /> এই মাসের বেতন যোগ করুন</>
      )}
    </button>
  );
}

function PhotoPicker({ member, onPick }: { member: Member; onPick: (file: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => ref.current?.click()}
      className="relative shrink-0"
      aria-label="ছবি পরিবর্তন"
    >
      <MemberAvatar name={member.name} photoUrl={member.photo_url} size="lg" />
      <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-card">
        <Camera className="h-3 w-3" />
      </span>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </button>
  );
}

function AddMemberDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [type, setType] = useState<"daily" | "monthly">("daily");
  const [rate, setRate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const previewUrl = file ? URL.createObjectURL(file) : null;

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const ins = await supabase.from("members").insert({
        owner_id: u.user.id,
        name: name.trim(),
        phone: phone.trim() || null,
        role: role.trim() || null,
        type,
        rate: Number(rate) || 0,
      }).select("id").single();
      if (ins.error) throw ins.error;

      if (file) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${u.user.id}/${ins.data.id}-${Date.now()}.${ext}`;
        const up = await supabase.storage.from(MEMBER_PHOTO_BUCKET).upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (up.error) throw up.error;
        const upd = await supabase.from("members").update({ photo_url: path }).eq("id", ins.data.id);
        if (upd.error) throw upd.error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("সদস্য যোগ হয়েছে");
      setOpen(false);
      setName(""); setPhone(""); setRole(""); setType("daily"); setRate(""); setFile(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1 h-4 w-4" /> যোগ করুন</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>নতুন সদস্য</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative shrink-0"
              aria-label="ছবি যুক্ত করুন"
            >
              <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full bg-accent text-accent-foreground">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-7 w-7 text-muted-foreground" />
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-background">
                <Camera className="h-3 w-3" />
              </span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </button>
            <div className="text-xs text-muted-foreground">
              {file ? file.name : "ছবি যুক্ত করতে চাপুন (ঐচ্ছিক)"}
            </div>
          </div>
          <div className="space-y-1.5"><Label>নাম *</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>পদবী</Label><Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="যেমন: হেল্পার" /></div>
          <div className="space-y-1.5"><Label>ফোন</Label><PhoneInputBD value={phone} onChange={setPhone} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>ধরন</Label>
              <Select value={type} onValueChange={(v) => setType(v as "daily" | "monthly")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">দৈনিক</SelectItem>
                  <SelectItem value="monthly">মাসিক</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{type === "daily" ? "দৈনিক রেট" : "মাসিক বেতন"}</Label>
              <Input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending} className="w-full">সংরক্ষণ করুন</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditMemberDialog({ member, fullWidth = false }: { member: Member; fullWidth?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {fullWidth ? (
          <Button variant="outline" className="flex-1">
            <Pencil className="mr-1.5 h-4 w-4" /> এডিট
          </Button>
        ) : (
          <button
            className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
            aria-label="এডিট করুন"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>প্রফাইল এডিট</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <EditFieldRow label="নাম" value={member.name} field="name" memberId={member.id} />
          <EditFieldRow label="পদবী" value={member.role ?? "—"} field="role" memberId={member.id} placeholder="যেমন: হেল্পার" />
          <EditFieldRow label="মোবাইল" value={member.phone ? toBn(member.phone) : "—"} field="phone" memberId={member.id} />
          <EditTypeRow member={member} />
          <EditRateRow member={member} />
          <div className="pt-2">
            <div className="mb-1 text-xs font-semibold text-muted-foreground">ব্যাংক ও পেমেন্ট একাউন্ট</div>
            <MemberAccounts memberId={member.id} memberName={member.name} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditFieldRow({
  label, value, field, memberId, placeholder,
}: {
  label: string; value: string; field: "name" | "role" | "phone"; memberId: string; placeholder?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(value === "—" ? "" : value);
  const save = useMutation({
    mutationFn: async () => {
      const trimmed = val.trim();
      const payload: { name?: string; role?: string | null; phone?: string | null } = {};
      if (field === "name") {
        if (!trimmed) throw new Error("নাম দরকার");
        payload.name = trimmed;
      } else if (field === "role") {
        payload.role = trimmed || null;
      } else {
        payload.phone = trimmed || null;
      }
      const { error } = await supabase.from("members").update(payload).eq("id", memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      toast.success("আপডেট হয়েছে");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setVal(value === "—" ? "" : value); }}>
      <DialogTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-left transition hover:bg-accent/40">
          <div className="min-w-0">
            <div className="text-[10.5px] text-muted-foreground">{label}</div>
            <div className="truncate text-sm font-medium">{value}</div>
          </div>
          <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{label} এডিট</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label>{label}</Label>
          {field === "phone" ? (
            <PhoneInputBD value={val} onChange={setVal} />
          ) : (
            <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder={placeholder} autoFocus />
          )}
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">সংরক্ষণ করুন</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditTypeRow({ member }: { member: Member }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"daily" | "monthly">(member.type);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("members").update({ type }).eq("id", member.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      toast.success("আপডেট হয়েছে");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setType(member.type); }}>
      <DialogTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-left transition hover:bg-accent/40">
          <div>
            <div className="text-[10.5px] text-muted-foreground">ধরন (দৈনিক/মাসিক)</div>
            <div className="text-sm font-medium">{member.type === "daily" ? "দৈনিক" : "মাসিক"}</div>
          </div>
          <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>ধরন পরিবর্তন</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label>ধরন</Label>
          <Select value={type} onValueChange={(v) => setType(v as "daily" | "monthly")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">দৈনিক</SelectItem>
              <SelectItem value="monthly">মাসিক</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">সংরক্ষণ করুন</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRateRow({ member }: { member: Member }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rate, setRate] = useState(String(member.rate ?? ""));
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("members").update({ rate: Number(rate) || 0 }).eq("id", member.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
      qc.invalidateQueries({ queryKey: ["balances"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("আপডেট হয়েছে। পূর্বের হিসাব অপরিবর্তিত থাকবে।");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const label = member.type === "daily" ? "দৈনিক রেট" : "মাসিক বেতন";
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setRate(String(member.rate ?? "")); }}>
      <DialogTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2.5 text-left transition hover:bg-accent/40">
          <div>
            <div className="text-[10.5px] text-muted-foreground">{label}</div>
            <div className="text-sm font-medium">{taka(member.rate)}{member.type === "daily" ? "/দিন" : "/মাস"}</div>
          </div>
          <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{label} পরিবর্তন</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label>{label}</Label>
          <Input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^0-9.]/g, ""))} autoFocus />
          <p className="text-[11px] text-muted-foreground">পূর্বের হাজিরা ও বেতনে কোনো ইফেক্ট পড়বে না, শুধু নতুন এন্ট্রিতে প্রযোজ্য হবে।</p>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full">সংরক্ষণ করুন</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
