import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarRange } from "lucide-react";

export type PeriodPreset =
  | "all"
  | "today"
  | "last7"
  | "running"
  | "lastmonth"
  | "month"
  | "year"
  | "custom";

export type PeriodValue = {
  preset: PeriodPreset;
  date: string;
  month: string;
  year: string;
  from: string;
  to: string;
};

export const PERIOD_LABEL: Record<PeriodPreset, string> = {
  all: "সব সময়",
  today: "নির্দিষ্ট তারিখ",
  last7: "শেষ ৭ দিন",
  running: "চলতি মাস",
  lastmonth: "গত মাস",
  month: "নির্দিষ্ট মাস",
  year: "নির্দিষ্ট বছর",
  custom: "কাস্টম ডেট",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function defaultPeriod(): PeriodValue {
  const now = new Date();
  return {
    preset: "running",
    date: iso(now),
    month: iso(now).slice(0, 7),
    year: String(now.getFullYear()),
    from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: iso(now),
  };
}

/** Returns inclusive ISO date bounds, or null when unbounded. */
export function periodRange(v: PeriodValue): { from: string | null; to: string | null } {
  const now = new Date();
  switch (v.preset) {
    case "today":
      return { from: v.date, to: v.date };
    case "last7": {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      return { from: iso(start), to: iso(now) };
    }
    case "running":
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      };
    case "lastmonth":
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };
    case "month": {
      const [y, m] = v.month.split("-").map(Number);
      if (!y || !m) return { from: null, to: null };
      return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    }
    case "year": {
      const y = Number(v.year);
      if (!y) return { from: null, to: null };
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case "custom":
      return { from: v.from || null, to: v.to || null };
    default:
      return { from: null, to: null };
  }
}

export function inPeriod(dateStr: string, v: PeriodValue) {
  const { from, to } = periodRange(v);
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

export function PeriodFilter({
  value,
  onChange,
  shootings,
  shootingId,
  onShootingChange,
}: {
  value: PeriodValue;
  onChange: (v: PeriodValue) => void;
  shootings?: { id: string; name: string; shoot_date: string }[];
  shootingId?: string;
  onShootingChange?: (id: string) => void;
}) {
  const set = (patch: Partial<PeriodValue>) => onChange({ ...value, ...patch });

  return (
    <div className="rounded-2xl border bg-card p-3 space-y-2.5">
      <div className="flex items-center gap-1.5 text-[12px] font-semibold">
        <CalendarRange className="h-3.5 w-3.5 text-primary" /> আয় ও ব্যয় ফিল্টার
      </div>

      <div className="grid grid-cols-1 gap-2 min-[520px]:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">সময়</Label>
          <Select
            value={value.preset}
            onValueChange={(p) => set({ preset: p as PeriodPreset })}
          >
            <SelectTrigger className="h-9 text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as PeriodPreset[]).map((k) => (
                <SelectItem key={k} value={k} className="text-[12.5px]">
                  {PERIOD_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {shootings && onShootingChange && (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">শুটিং</Label>
            <Select value={shootingId ?? "all"} onValueChange={onShootingChange}>
              <SelectTrigger className="h-9 text-[12.5px]">
                <SelectValue placeholder="সব শুটিং" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-[12.5px]">
                  সব শুটিং
                </SelectItem>
                {shootings.map((s) => (
                  <SelectItem key={s.id} value={s.id} className="text-[12.5px]">
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {value.preset === "today" && (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">তারিখ</Label>
            <Input
              type="date"
              className="h-9 text-[12.5px]"
              value={value.date}
              onChange={(e) => set({ date: e.target.value })}
            />
          </div>
        )}

        {value.preset === "month" && (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">মাস</Label>
            <Input
              type="month"
              className="h-9 text-[12.5px]"
              value={value.month}
              onChange={(e) => set({ month: e.target.value })}
            />
          </div>
        )}

        {value.preset === "year" && (
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">বছর</Label>
            <Input
              type="number"
              inputMode="numeric"
              className="h-9 text-[12.5px]"
              value={value.year}
              onChange={(e) => set({ year: e.target.value })}
            />
          </div>
        )}

        {value.preset === "custom" && (
          <>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">শুরুর তারিখ</Label>
              <Input
                type="date"
                className="h-9 text-[12.5px]"
                value={value.from}
                onChange={(e) => set({ from: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">শেষ তারিখ</Label>
              <Input
                type="date"
                className="h-9 text-[12.5px]"
                value={value.to}
                onChange={(e) => set({ to: e.target.value })}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
