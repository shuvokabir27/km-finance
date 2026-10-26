import { useRef, useEffect } from "react";

type Props = {
  value: string;
  onChange: (v: string) => void;
};

// 11-digit Bangladeshi mobile number input with locked +88 prefix.
// Renders 11 single-digit boxes. Green border when all 11 digits filled
// (and starts with 0), red border when partially filled but invalid.
export function PhoneInputBD({ value, onChange }: Props) {
  const digits = (value || "").replace(/\D/g, "").slice(0, 11).split("");
  while (digits.length < 11) digits.push("");
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const filled = digits.filter((d) => d !== "").length;
  const isComplete = filled === 11 && digits[0] === "0" && digits[1] === "1";
  const isInvalid = filled > 0 && !isComplete;

  useEffect(() => {
    refs.current = refs.current.slice(0, 11);
  }, []);

  function setDigit(i: number, ch: string) {
    const c = ch.replace(/\D/g, "").slice(-1);
    const arr = [...digits];
    arr[i] = c;
    onChange(arr.join("").replace(/\s+/g, ""));
    if (c && i < 10) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[i]) {
        const arr = [...digits];
        arr[i] = "";
        onChange(arr.join(""));
      } else if (i > 0) {
        refs.current[i - 1]?.focus();
        const arr = [...digits];
        arr[i - 1] = "";
        onChange(arr.join(""));
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft" && i > 0) {
      refs.current[i - 1]?.focus();
      e.preventDefault();
    } else if (e.key === "ArrowRight" && i < 10) {
      refs.current[i + 1]?.focus();
      e.preventDefault();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const txt = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!txt) return;
    e.preventDefault();
    let clean = txt;
    if (clean.startsWith("88")) clean = clean.slice(2);
    clean = clean.slice(0, 11);
    onChange(clean);
    const next = Math.min(clean.length, 10);
    setTimeout(() => refs.current[next]?.focus(), 0);
  }

  const borderClass = isComplete
    ? "border-success ring-1 ring-success/40 bg-success/5"
    : isInvalid
    ? "border-destructive ring-1 ring-destructive/40 bg-destructive/5"
    : "border-input";

  return (
    <div className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 transition ${borderClass}`}>
      <span className="select-none rounded bg-muted px-1.5 py-1 text-xs font-semibold text-muted-foreground">
        +88
      </span>
      <div className="flex flex-1 items-center gap-1 overflow-x-auto">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={d}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={`ডিজিট ${i + 1}`}
            className={`h-8 w-6 shrink-0 rounded border bg-background text-center text-sm font-semibold tabular-nums focus:outline-none focus:ring-1 focus:ring-ring ${
              d ? "border-foreground/30" : "border-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
