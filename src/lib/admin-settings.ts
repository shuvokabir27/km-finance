import { supabase } from "@/integrations/supabase/client";
import { fetchAdminProfileCredentials, saveAdminCredentialsServerFn } from "./sms-otp.functions";

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

  // 1. Try server function for guaranteed retrieval
  try {
    const res = await fetchAdminProfileCredentials({
      data: { userId: userData.user.id, email: userData.user.email ?? "" },
    });
    if (res && res.mobile) {
      setAdminMobile(res.mobile);
      return { mobile: res.mobile, has_pin: res.has_pin };
    }
  } catch (e) {
    console.warn("fetchAdminProfileCredentials fallback to view", e);
  }

  // 2. View fallback
  try {
    const { data } = await supabase
      .from("admin_credentials_safe" as any)
      .select("mobile, has_pin")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (data && (data as any).mobile) {
      setAdminMobile((data as any).mobile);
      return data as { mobile: string; has_pin: boolean };
    }
  } catch (e) {
    console.warn("admin_credentials_safe query error", e);
  }

  // 3. LocalStorage fallback
  const localMobile = getAdminMobile();
  if (localMobile) {
    return { mobile: localMobile, has_pin: hasAdminPin() };
  }

  return null;
}

export async function saveServerCredentials(mobile: string, pin: string): Promise<{ error?: string }> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { error: "লগইন প্রয়োজন" };
  if (!/^\d{11}$/.test(mobile)) return { error: "মোবাইল ১১ ডিজিটের হতে হবে" };
  if (!/^\d{4}$/.test(pin)) return { error: "পিন ৪ ডিজিটের হতে হবে" };

  try {
    await saveAdminCredentialsServerFn({
      data: {
        userId: user.id,
        email: user.email ?? "",
        mobile,
        pin,
      },
    });
    setAdminMobile(mobile);
    setAdminPin(pin);
    return {};
  } catch (serverErr: any) {
    // Fallback directly via supabase client if server function throws
    const { error } = await supabase.from("admin_credentials").upsert(
      { user_id: user.id, email: user.email ?? "", mobile, pin },
      { onConflict: "user_id" },
    );
    if (error) return { error: error.message };
    setAdminMobile(mobile);
    setAdminPin(pin);
    return {};
  }
}

export async function clearServerCredentials(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  await supabase.from("admin_credentials").delete().eq("user_id", userData.user.id);
  setAdminMobile("");
  setAdminPin("");
}
