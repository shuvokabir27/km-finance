import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tv, UserCog, Calendar, Clapperboard, ChevronRight, Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toBn, bnDate, taka } from "@/lib/format";
import { BrandAvatar, BrandImageUpload, ChannelChip, DirectorChip, useChannels, useDirectors } from "@/lib/brand";

export const Route = createFileRoute("/_authenticated/directory")({
  component: DirectoryPage,
});

type Shooting = {
  id: string;
  name: string;
  shoot_date: string;
  location: string | null;
  director: string | null;
  channel: string | null;
};

type Summary = {
  present_count: number;
  attendance_cost: number;
  extra_cost: number;
  total_cost: number;
};

function DirectoryPage() {
  const [tab, setTab] = useState<"channel" | "director">("channel");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: shootings = [], isLoading } = useQuery({
    queryKey: ["shootings", "directory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shootings")
        .select("id, name, shoot_date, location, director, channel")
        .order("shoot_date", { ascending: false });
      if (error) throw error;
      return data as Shooting[];
    },
  });

  const { data: channels = [] } = useChannels();
  const { data: directors = [] } = useDirectors();

  // Group shootings & merge with registered channels/directors (even if no shootings yet)
  const groups = useMemo(() => {
    const map = new Map<string, Shooting[]>();
    for (const s of shootings) {
      const key = (tab === "channel" ? s.channel : s.director)?.trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    const registered = tab === "channel" ? channels.map((c) => c.name) : directors.map((d) => d.name);
    for (const n of registered) if (!map.has(n)) map.set(n, []);
    return [...map.entries()]
      .map(([name, items]) => ({ name, items }))
      .sort((a, b) => a.name.localeCompare(b.name, "bn"));
  }, [shootings, tab, channels, directors]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [groups, query]);

  const selectedItems = selected
    ? groups.find((g) => g.name === selected)?.items ?? []
    : [];

  const selectedRecord = selected
    ? tab === "channel"
      ? channels.find((c) => c.name === selected)
      : directors.find((d) => d.name === selected)
    : null;
  const selectedImage =
    selectedRecord && "logo_url" in selectedRecord
      ? selectedRecord.logo_url
      : selectedRecord && "photo_url" in selectedRecord
      ? selectedRecord.photo_url
      : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ডিরেক্টরি</h1>
        <p className="text-sm text-muted-foreground">
          চ্যানেল ও পরিচালকদের কাজের তালিকা
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-1">
        <button
          onClick={() => {
            setTab("channel");
            setSelected(null);
          }}
          className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
            tab === "channel" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <Tv className="h-4 w-4" /> চ্যানেল
        </button>
        <button
          onClick={() => {
            setTab("director");
            setSelected(null);
          }}
          className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
            tab === "director" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          <UserCog className="h-4 w-4" /> পরিচালক
        </button>
      </div>

      {!selected && (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tab === "channel" ? "চ্যানেল খুঁজুন…" : "পরিচালক খুঁজুন…"}
                className="pl-9"
              />
            </div>
            <AddBrandDialog kind={tab} />
          </div>

          {isLoading && (
            <div className="py-10 text-center text-muted-foreground">লোড হচ্ছে…</div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
              {tab === "channel" ? (
                <Tv className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              ) : (
                <UserCog className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              )}
              <p className="text-sm text-muted-foreground">
                কোনো {tab === "channel" ? "চ্যানেল" : "পরিচালক"} পাওয়া যায়নি
              </p>
            </div>
          )}

          <div className="space-y-2">
            {filtered.map((g) => {
              const rec =
                tab === "channel"
                  ? channels.find((c) => c.name === g.name)
                  : directors.find((d) => d.name === g.name);
              const img =
                rec && "logo_url" in rec
                  ? rec.logo_url
                  : rec && "photo_url" in rec
                  ? rec.photo_url
                  : null;
              return (
                <button
                  key={g.name}
                  onClick={() => setSelected(g.name)}
                  className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition hover:bg-accent/40 active:scale-[0.99]"
                >
                  <BrandAvatar kind={tab} name={g.name} src={img} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{g.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {toBn(g.items.length)} টি শুটিং
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </>
      )}

      {selected && (
        <SelectedDetail
          name={selected}
          kind={tab}
          items={selectedItems}
          imageUrl={selectedImage}
          onBack={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function SelectedDetail({
  name,
  kind,
  items,
  imageUrl,
  onBack,
}: {
  name: string;
  kind: "channel" | "director";
  items: Shooting[];
  imageUrl: string | null | undefined;
  onBack: () => void;
}) {
  const ids = items.map((i) => i.id);

  const { data: summaries } = useQuery({
    queryKey: ["directory-summaries", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const out: Record<string, Summary> = {};
      await Promise.all(
        ids.map(async (id) => {
          const { data, error } = await supabase.rpc("shooting_summary", {
            _shooting_id: id,
          });
          if (error) return;
          const row = (data as Summary[] | null)?.[0];
          if (row) {
            out[id] = {
              present_count: Number(row.present_count ?? 0),
              attendance_cost: Number(row.attendance_cost ?? 0),
              extra_cost: Number(row.extra_cost ?? 0),
              total_cost: Number(row.total_cost ?? 0),
            };
          }
        }),
      );
      return out;
    },
  });

  const totalCost = Object.values(summaries ?? {}).reduce(
    (a, s) => a + (s.total_cost ?? 0),
    0,
  );

  return (
    <div className="space-y-3">
      <button
        onClick={onBack}
        className="text-xs font-medium text-primary hover:underline"
      >
        ← ফিরে যান
      </button>

      <div className="space-y-3 rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <BrandAvatar kind={kind} name={name} src={imageUrl} size={56} />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted-foreground">
              {kind === "channel" ? "চ্যানেল" : "পরিচালক"}
            </div>
            <div className="truncate text-lg font-bold">{name}</div>
          </div>
        </div>
        <BrandImageUpload kind={kind} name={name} currentUrl={imageUrl} size={64} />
        {kind === "channel" && <ChannelOwnershipToggle name={name} />}
        {kind === "channel" && <ChannelSharedToggle name={name} />}
      </div>

      <div className="rounded-2xl border bg-card p-3">
        <div className="grid grid-cols-2 gap-2 text-center">
          <div className="rounded-xl bg-muted/40 p-2">
            <div className="text-[10.5px] text-muted-foreground">মোট শুটিং</div>
            <div className="text-sm font-semibold">{toBn(items.length)}</div>
          </div>
          <div className="rounded-xl bg-primary/10 p-2">
            <div className="text-[10.5px] text-primary">মোট খরচ</div>
            <div className="text-sm font-bold text-primary">{taka(totalCost)}</div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((s) => {
          const sum = summaries?.[s.id];
          return (
            <Link
              key={s.id}
              to="/shootings"
              className="flex items-start gap-3 rounded-2xl border bg-card p-4 transition hover:bg-accent/40 active:scale-[0.99]"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Clapperboard className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{s.name}</div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3" /> {bnDate(s.shoot_date)}
                </div>
                {kind === "channel" && s.director && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="text-muted-foreground/70 shrink-0">পরিচালক:</span>
                    <DirectorChip name={s.director} size={14} />
                  </div>
                )}
                {kind === "director" && s.channel && (
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="text-muted-foreground/70 shrink-0">চ্যানেল:</span>
                    <ChannelChip name={s.channel} size={14} />
                  </div>
                )}
                {s.location && (
                  <div className="truncate text-xs text-muted-foreground">
                    {s.location}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="text-[10.5px] text-muted-foreground">খরচ</div>
                <div className="text-sm font-bold text-primary">
                  {taka(sum?.total_cost ?? 0)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ChannelOwnershipToggle({ name }: { name: string }) {
  const qc = useQueryClient();
  const { data: channels = [] } = useChannels();
  const ch = channels.find((c) => c.name === name);
  const isOwn = !!ch?.is_own;

  const toggle = useMutation({
    mutationFn: async (nextIsOwn: boolean) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const { error } = await supabase
        .from("channels")
        .update({ is_own: nextIsOwn })
        .eq("owner_id", u.user.id)
        .eq("name", name);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      qc.invalidateQueries({ queryKey: ["client-channel-summary"] });
      toast.success("সংরক্ষণ হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex items-center justify-between rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
      <div className="min-w-0 pr-2">
        <div className="text-sm font-semibold">নিজের চ্যানেল</div>
        <div className="text-[11px] text-muted-foreground">
          {isOwn
            ? "এই চ্যানেলের কাজ ক্লায়েন্ট বকেয়া হিসাবে গণ্য হবে না"
            : "বাহিরের/ক্লায়েন্ট চ্যানেল — চুক্তি ও বকেয়া হিসাব রাখা যাবে"}
        </div>
      </div>
      <Switch checked={isOwn} onCheckedChange={(v) => toggle.mutate(v)} disabled={toggle.isPending} />
    </div>
  );
}

function ChannelSharedToggle({ name }: { name: string }) {
  const qc = useQueryClient();
  const { data: channels = [] } = useChannels();
  const ch = channels.find((c) => c.name === name);
  const isShared = !!ch?.is_shared;

  const toggle = useMutation({
    mutationFn: async (next: boolean) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const { error } = await supabase
        .from("channels")
        .update({ is_shared: next })
        .eq("owner_id", u.user.id)
        .eq("name", name);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      qc.invalidateQueries({ queryKey: ["shared-channel-summary"] });
      qc.invalidateQueries({ queryKey: ["partner-ledger"] });
      toast.success("সংরক্ষণ হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex items-center justify-between rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-2">
      <div className="min-w-0 pr-2">
        <div className="text-sm font-semibold">শেয়ার চ্যানেল</div>
        <div className="text-[11px] text-muted-foreground">
          {isShared
            ? "দুই পক্ষের মালিকানা — ইনকাম খরচ বাদে ভাগ হবে"
            : "চালু করলে মালিক যোগ করে ইনকাম ভাগ করা যাবে"}
        </div>
      </div>
      <Switch checked={isShared} onCheckedChange={(v) => toggle.mutate(v)} disabled={toggle.isPending} />
    </div>
  );
}

function AddBrandDialog({ kind }: { kind: "channel" | "director" }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  const add = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("নাম লিখুন");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      const { error } = await supabase
        .from(kind === "channel" ? "channels" : "directors")
        .insert({ owner_id: u.user.id, name: trimmed } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [kind === "channel" ? "channels" : "directors"] });
      toast.success(kind === "channel" ? "চ্যানেল যোগ হয়েছে" : "পরিচালক যোগ হয়েছে");
      setName("");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="shrink-0">
          <Plus className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {kind === "channel" ? "নতুন চ্যানেল যোগ করুন" : "নতুন পরিচালক যোগ করুন"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            add.mutate();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "channel" ? "চ্যানেলের নাম" : "পরিচালকের নাম"}
          />
          <Button type="submit" className="w-full" disabled={add.isPending}>
            {add.isPending ? "সংরক্ষণ হচ্ছে…" : "সংরক্ষণ করুন"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
