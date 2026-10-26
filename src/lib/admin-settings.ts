import { supabase } from "@/integrations/supabase/client";

// Per-device delete-PIN gating (kept for backward compatibility with confirm-delete)
const PIN_KEY = "km_admin_pin";
const MOBILE_KEY = "km_admin_mobile";

export function getAdminPin(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(PIN_KEY) ?? "";
}

export function setAdminPin(pin: string) {
  if (typeof window === "undefined") return;
  if (pin) localStorage.setItem(PIN_KEY, pin);
  else localStorage.removeItem(PIN_KEY);
}

export function getAdminMobile(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(MOBILE_KEY) ?? "";
}

export function setAdminMobile(mobile: string) {
  if (typeof window === "undefined") return;
  if (mobile) localStorage.setItem(MOBILE_KEY, mobile);
  else localStorage.removeItem(MOBILE_KEY);
}

export function hasAdminPin(): boolean {
  return getAdminPin().length === 4;
}

export function verifyAdminPin(pin: string): boolean {
  const saved = getAdminPin();
  if (!saved) return true;
  return saved === pin;
}

// ---------- Server-side credentials (mobile + PIN login) ----------

export async function loadServerCredentials(): Promise<{ mobile: string; has_pin: boolean } | null> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return null;
  const { data } = await supabase
    .from("admin_credentials_safe" as any)
    .select("mobile, has_pin")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  return (data as { mobile: string; has_pin: boolean } | null) ?? null;
}

export async function saveServerCredentials(mobile: string, pin: string): Promise<{ error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "লগইন প্রয়োজন" };
  if (!/^\d{11}$/.test(mobile)) return { error: "মোবাইল ১১ ডিজিটের হতে হবে" };
  if (!/^\d{4}$/.test(pin)) return { error: "পিন ৪ ডিজিটের হতে হবে" };

  const { error } = await supabase.from("admin_credentials").upsert(
    { user_id: user.id, email: user.email ?? "", mobile, pin },
    { onConflict: "user_id" },
  );
  if (error) return { error: error.message };
  return {};
}

export async function clearServerCredentials(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  await supabase.from("admin_credentials").delete().eq("user_id", userData.user.id);
}
