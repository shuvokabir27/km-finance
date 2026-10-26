const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBn(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);
}

export function taka(n: number | string | null | undefined): string {
  const num = Number(n ?? 0);
  const formatted = num.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `৳ ${formatted}`;
}

export function bnDate(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return toBn(date.toLocaleDateString("en-GB"));
}
