import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Tv, UserCog, Camera, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type Channel = { id: string; name: string; logo_url: string | null; is_own?: boolean; is_shared?: boolean };
export type Director = { id: string; name: string; photo_url: string | null };

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("channels")
        .select("id, name, logo_url, is_own, is_shared")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Channel[];
    },
  });
}

export function useDirectors() {
  return useQuery({
    queryKey: ["directors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("directors")
        .select("id, name, photo_url")
        .order("name");
      if (error) throw error;
      return (data ?? []) as Director[];
    },
  });
}

export async function ensureChannel(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return trimmed;
  await supabase
    .from("channels")
    .insert({ owner_id: u.user.id, name: trimmed })
    .select()
    .maybeSingle();
  return trimmed;
}

export async function ensureDirector(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return trimmed;
  await supabase
    .from("directors")
    .insert({ owner_id: u.user.id, name: trimmed })
    .select()
    .maybeSingle();
  return trimmed;
}

// Resize image client-side to a small square dataURL (jpeg)
export async function fileToDataUrl(file: File, maxSize = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
  const w = Math.round(bitmap.width * ratio);
  const h = Math.round(bitmap.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function initials(name: string) {
  const t = name.trim();
  if (!t) return "?";
  const parts = t.split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]).join("").toUpperCase();
}

export function BrandAvatar({
  name,
  src,
  kind,
  size = 24,
  className,
}: {
  name: string;
  src: string | null | undefined;
  kind: "channel" | "director";
  size?: number;
  className?: string;
}) {
  const Icon = kind === "channel" ? Tv : UserCog;
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size }}
        className={cn(
          "shrink-0 rounded-full object-cover ring-1 ring-border bg-muted",
          className,
        )}
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.42) }}
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-primary/10 font-semibold text-primary ring-1 ring-primary/15",
        className,
      )}
      aria-label={name}
    >
      {name?.trim() ? initials(name) : <Icon style={{ width: size * 0.6, height: size * 0.6 }} />}
    </span>
  );
}

/** Show a channel name with its logo */
export function ChannelChip({ name, size = 18 }: { name: string; size?: number }) {
  const { data: channels = [] } = useChannels();
  const ch = channels.find((c) => c.name === name);
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <BrandAvatar kind="channel" name={name} src={ch?.logo_url} size={size} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Show a director name with photo */
export function DirectorChip({ name, size = 18 }: { name: string; size?: number }) {
  const { data: directors = [] } = useDirectors();
  const d = directors.find((x) => x.name === name);
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <BrandAvatar kind="director" name={name} src={d?.photo_url} size={size} />
      <span className="truncate">{name}</span>
    </span>
  );
}

/** Generic combobox with avatar in dropdown */
function BrandCombobox({
  kind,
  value,
  onChange,
  className,
  placeholder,
  items,
}: {
  kind: "channel" | "director";
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder: string;
  items: { id: string; name: string; src: string | null }[];
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(value.toLowerCase()))
    : items;

  // close on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <Input
        className={className}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {filtered.map((item) => (
            <button
              type="button"
              key={item.id}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(item.name);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <BrandAvatar kind={kind} name={item.name} src={item.src} size={22} />
              <span className="truncate">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Combobox input for channels with logos */
export function ChannelField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { data: channels = [] } = useChannels();
  return (
    <BrandCombobox
      kind="channel"
      value={value}
      onChange={onChange}
      className={className}
      placeholder="চ্যানেল নাম (টাইপ করুন বা ড্রপডাউন থেকে বাছুন)"
      items={channels.map((c) => ({ id: c.id, name: c.name, src: c.logo_url }))}
    />
  );
}

/** Combobox input for directors with photos */
export function DirectorField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { data: directors = [] } = useDirectors();
  return (
    <BrandCombobox
      kind="director"
      value={value}
      onChange={onChange}
      className={className}
      placeholder="পরিচালকের নাম (টাইপ করুন বা ড্রপডাউন থেকে বাছুন)"
      items={directors.map((d) => ({ id: d.id, name: d.name, src: d.photo_url }))}
    />
  );
}


/** Upload + manage image for a channel or director (identified by name) */
export function BrandImageUpload({
  kind,
  name,
  currentUrl,
  size = 72,
}: {
  kind: "channel" | "director";
  name: string;
  currentUrl: string | null | undefined;
  size?: number;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const table = kind === "channel" ? "channels" : "directors";
  const col = kind === "channel" ? "logo_url" : "photo_url";
  const queryKey = kind === "channel" ? "channels" : "directors";

  const save = useMutation({
    mutationFn: async (dataUrl: string | null) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন প্রয়োজন");
      // upsert by (owner_id, name)
      const { error } = await supabase
        .from(table)
        .upsert(
          { owner_id: u.user.id, name, [col]: dataUrl } as never,
          { onConflict: "owner_id,name" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [queryKey] });
      toast.success("ছবি আপডেট হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPick = async (file: File) => {
    try {
      setBusy(true);
      const url = await fileToDataUrl(file, 256);
      await save.mutateAsync(url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <div className="relative">
        <BrandAvatar kind={kind} name={name} src={currentUrl} size={size} />
        {busy && (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 disabled:opacity-60"
        >
          <Camera className="h-3.5 w-3.5" /> {currentUrl ? "ছবি পরিবর্তন" : "ছবি আপলোড"}
        </button>
        {currentUrl && (
          <button
            type="button"
            onClick={() => save.mutate(null)}
            className="text-left text-[11px] text-destructive hover:underline"
          >
            ছবি মুছুন
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
