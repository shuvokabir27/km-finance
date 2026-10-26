import { supabase } from "@/integrations/supabase/client";
import type { AccountKind } from "@/lib/bd-banks";

/**
 * পেমেন্টে টাইপ করা নম্বর সদস্যের সংরক্ষিত অ্যাকাউন্টে যোগ করে।
 * একই ধরনের একই নম্বর আগে থেকে থাকলে কিছু করে না।
 */
export async function saveMemberAccountIfNew(opts: {
  ownerId: string;
  memberId: string;
  memberName?: string | null;
  method: string;
  accountNumber: string;
  bankName?: string | null;
}) {
  const { ownerId, memberId, memberName, method, accountNumber, bankName } = opts;
  const number = accountNumber.trim();
  if (!number || method === "cash") return;
  const kinds: AccountKind[] = ["bkash", "nagad", "rocket", "upay", "bank"];
  if (!kinds.includes(method as AccountKind)) return;
  const kind = method as AccountKind;

  const { data: existing } = await supabase
    .from("member_accounts")
    .select("id")
    .eq("member_id", memberId)
    .eq("kind", kind)
    .eq("account_number", number)
    .limit(1);
  if (existing && existing.length > 0) return;

  await supabase.from("member_accounts").insert({
    owner_id: ownerId,
    member_id: memberId,
    kind,
    bank_name: kind === "bank" ? bankName ?? null : null,
    account_holder: memberName ?? null,
    account_number: number,
  });
}
