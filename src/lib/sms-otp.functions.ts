import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomInt, timingSafeEqual } from "crypto";
import type { Database } from "@/integrations/supabase/types";

const hashCode = (code: string, mobile: string) =>
  createHash("sha256").update(`${mobile}:${code}`).digest("hex");

const normalizeMobile = (m: string) => m.replace(/\D/g, "").slice(-11);

async function sendBulkSms(mobile: string, message: string) {
  const apiKey = process.env.BULKSMSBD_API_KEY;
  const senderId = process.env.BULKSMSBD_SENDER_ID;
  if (!apiKey || !senderId) throw new Error("SMS provider not configured");
  const body = new URLSearchParams();
  body.set("api_key", apiKey);
  body.set("type", /[^\x00-\x7F]/.test(message) ? "unicode" : "text");
  body.set("number", mobile);
  body.set("senderid", senderId);
  body.set("message", message);
  const res = await fetch("https://bulksmsbd.net/api/smsapi", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });
  const text = await res.text();
  console.log("[BulkSMSBD-OTP] status=", res.status, "body=", text, "to=", mobile);
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch {}
  const code = parsed?.response_code;
  // 202 = Submitted Successfully (per BulkSMSBD docs)
  if (!res.ok || code !== 202) {
    const errMsg = parsed?.error_message || parsed?.success_message || parsed?.message || text || `HTTP ${res.status}`;
    throw new Error(`SMS পাঠাতে ব্যর্থ: ${errMsg}`);
  }
}

function admin() {
  const url = (process.env.SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
  return createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const requestSmsOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { mobile: string; pin: string }) => d)
  .handler(async ({ data }) => {
    const mobile = normalizeMobile(data.mobile);
    if (!/^\d{11}$/.test(mobile)) throw new Error("সঠিক মোবাইল নাম্বার দিন");
    if (!/^\d{4}$/.test(data.pin)) throw new Error("৪ ডিজিটের পিন দিন");

    const sb = admin();
    let email: unknown = null;
    try {
      const res = await sb.rpc("find_email_by_mobile_pin", { _mobile: mobile, _pin: data.pin });
      if (res.error) throw new Error(res.error.message);
      email = res.data;
    } catch (e: any) {
      console.error("[OTP] lookup failed:", e?.message || e);
      throw new Error("সার্ভারে সাময়িক সমস্যা হচ্ছে, একটু পরে আবার চেষ্টা করুন");
    }
    if (!email) throw new Error("মোবাইল বা পিন ভুল");

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const code_hash = hashCode(code, mobile);
    const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Invalidate prior unused codes for this mobile
    await sb.from("sms_otp_codes").update({ used: true }).eq("mobile", mobile).eq("used", false);
    const { error: insErr } = await sb
      .from("sms_otp_codes")
      .insert({ mobile, email: email as string, code_hash, expires_at });
    if (insErr) throw new Error(insErr.message);

    // Format BD number for BulkSMSBD: 880XXXXXXXXXX
    const intl = mobile.startsWith("0") ? `880${mobile.slice(1)}` : mobile;
    const msg = `Kuakata Multimedia Finance login code: ${code}. Valid for 5 minutes. Do not share with anyone.`;
    await sendBulkSms(intl, msg);

    return { ok: true, maskedMobile: mobile.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") };
  });

export const verifySmsOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { mobile: string; code: string }) => d)
  .handler(async ({ data }) => {
    const mobile = normalizeMobile(data.mobile);
    if (!/^\d{6}$/.test(data.code)) throw new Error("৬ ডিজিটের কোড দিন");

    const sb = admin();
    const { data: rows, error } = await sb
      .from("sms_otp_codes")
      .select("*")
      .eq("mobile", mobile)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const row = rows?.[0];
    if (!row) throw new Error("কোড পাওয়া যায়নি, আবার রিকোয়েস্ট করুন");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("কোডের মেয়াদ শেষ");
    if (row.attempts >= 5) throw new Error("অনেকবার ভুল হয়েছে, আবার কোড নিন");

    const expected = hashCode(data.code, mobile);
    const a = Buffer.from(expected);
    const b = Buffer.from(row.code_hash);
    const match = a.length === b.length && timingSafeEqual(a, b);
    if (!match) {
      await sb.from("sms_otp_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      throw new Error("কোড ভুল");
    }
    await sb.from("sms_otp_codes").update({ used: true }).eq("id", row.id);

    // Generate a magiclink token the client can verify to create a session
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email: row.email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      throw new Error(linkErr?.message || "সেশন তৈরি ব্যর্থ");
    }
    return { email: row.email, tokenHash: linkData.properties.hashed_token };
  });

export const adminPinLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { pin: string; mobile?: string }) => d)
  .handler(async ({ data }) => {
    if (!/^\d{4}$/.test(data.pin)) {
      throw new Error("৪ ডিজিটের সঠিক পিন দিন");
    }

    const sb = admin();
    let email: string | null = null;
    let matchedMobile: string | null = null;

    // 1. If mobile was provided (e.g. from local client storage), check via find_email_by_mobile_pin
    if (data.mobile && /^\d{11}$/.test(data.mobile)) {
      const norm = normalizeMobile(data.mobile);
      try {
        const res = await sb.rpc("find_email_by_mobile_pin", { _mobile: norm, _pin: data.pin });
        if (res.data) {
          email = res.data;
          matchedMobile = norm;
        }
      } catch (e: any) {
        console.warn("[adminPinLogin] find_email_by_mobile_pin error:", e?.message);
      }
    }

    // 2. Try find_admin_by_pin RPC
    if (!email) {
      try {
        const res = await sb.rpc("find_admin_by_pin" as any, { _pin: data.pin });
        if (Array.isArray(res.data) && res.data.length > 0) {
          email = res.data[0].email;
          matchedMobile = res.data[0].mobile;
        } else if (res.data && typeof res.data === "object" && (res.data as any).email) {
          email = (res.data as any).email;
          matchedMobile = (res.data as any).mobile;
        }
      } catch {
        // RPC might not exist yet, fallback to row lookup
      }
    }

    // 3. Fallback: inspect admin_credentials rows using find_email_by_mobile_pin
    if (!email) {
      try {
        const { data: rows } = await sb.from("admin_credentials").select("mobile, email");
        if (rows && rows.length > 0) {
          for (const row of rows) {
            try {
              const res = await sb.rpc("find_email_by_mobile_pin", {
                _mobile: row.mobile,
                _pin: data.pin,
              });
              if (res.data) {
                email = res.data;
                matchedMobile = row.mobile;
                break;
              }
            } catch {}
          }
        }
      } catch (e: any) {
        console.error("[adminPinLogin] fallback error:", e?.message);
      }
    }

    if (!email) {
      throw new Error("পিন সঠিক নয়, সঠিক ৪ ডিজিটের পিন দিন");
    }

    // Generate magiclink token
    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      throw new Error(linkErr?.message || "লগইন সেশন তৈরি করতে সমস্যা হয়েছে");
    }

    return {
      ok: true,
      email,
      mobile: matchedMobile,
      tokenHash: linkData.properties.hashed_token,
    };
  });

export const fetchAdminProfileCredentials = createServerFn({ method: "POST" })
  .inputValidator((d: { userId?: string; email?: string }) => d)
  .handler(async ({ data }) => {
    const sb = admin();
    let query = sb.from("admin_credentials").select("mobile, pin, email, user_id");
    if (data.userId) {
      query = query.eq("user_id", data.userId);
    } else if (data.email) {
      query = query.eq("email", data.email);
    } else {
      query = query.limit(1);
    }
    const { data: row } = await query.maybeSingle();
    if (!row) return null;
    return {
      mobile: row.mobile || "",
      email: row.email || "",
      has_pin: Boolean(row.pin && row.pin.length > 0),
    };
  });

export const saveAdminCredentialsServerFn = createServerFn({ method: "POST" })
  .inputValidator((d: { userId: string; email: string; mobile: string; pin?: string }) => d)
  .handler(async ({ data }) => {
    const sb = admin();
    const updatePayload: any = {
      user_id: data.userId,
      email: data.email,
      mobile: normalizeMobile(data.mobile),
      updated_at: new Date().toISOString(),
    };
    if (data.pin && /^\d{4}$/.test(data.pin)) {
      updatePayload.pin = data.pin;
    }
    const { error } = await sb.from("admin_credentials").upsert(updatePayload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const requestAdminPinResetOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { mobile?: string }) => d)
  .handler(async ({ data }) => {
    const sb = admin();
    let mobile = data.mobile ? normalizeMobile(data.mobile) : null;
    let email: string | null = null;

    if (mobile && /^\d{11}$/.test(mobile)) {
      const { data: row } = await sb
        .from("admin_credentials")
        .select("mobile, email")
        .eq("mobile", mobile)
        .maybeSingle();
      if (row) {
        email = row.email;
      }
    }

    if (!email) {
      const { data: row } = await sb
        .from("admin_credentials")
        .select("mobile, email")
        .limit(1)
        .maybeSingle();
      if (!row || !row.mobile) {
        throw new Error("কোনো অ্যাডমিন অ্যাকাউন্ট পাওয়া যায়নি");
      }
      mobile = row.mobile;
      email = row.email;
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const code_hash = hashCode(code, mobile);
    const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    await sb.from("sms_otp_codes").update({ used: true }).eq("mobile", mobile).eq("used", false);
    const { error: insErr } = await sb
      .from("sms_otp_codes")
      .insert({ mobile, email: email as string, code_hash, expires_at });
    if (insErr) throw new Error(insErr.message);

    const intl = mobile.startsWith("0") ? `880${mobile.slice(1)}` : mobile;
    const msg = `Kuakata Multimedia Finance admin PIN reset code: ${code}. Valid for 5 minutes.`;
    await sendBulkSms(intl, msg);

    return {
      ok: true,
      mobile,
      maskedMobile: mobile.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2"),
    };
  });

export const verifyAndResetAdminPin = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; newPin: string; mobile?: string }) => d)
  .handler(async ({ data }) => {
    if (!/^\d{6}$/.test(data.code)) throw new Error("৬ ডিজিটের কোড দিন");
    if (!/^\d{4}$/.test(data.newPin)) throw new Error("নতুন পিন ৪ ডিজিটের হতে হবে");

    const sb = admin();
    let mobile = data.mobile ? normalizeMobile(data.mobile) : null;

    if (!mobile) {
      const { data: adminRow } = await sb
        .from("admin_credentials")
        .select("mobile")
        .limit(1)
        .maybeSingle();
      if (adminRow?.mobile) {
        mobile = adminRow.mobile;
      }
    }

    if (!mobile) throw new Error("অ্যাডমিন মোবাইল নাম্বার পাওয়া যায়নি");

    const { data: rows, error } = await sb
      .from("sms_otp_codes")
      .select("*")
      .eq("mobile", mobile)
      .eq("used", false)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw new Error(error.message);
    const row = rows?.[0];
    if (!row) throw new Error("কোড পাওয়া যায়নি, আবার কোড পাঠান");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("কোডের মেয়াদ শেষ");
    if (row.attempts >= 5) throw new Error("অনেকবার ভুল হয়েছে, নতুন কোড নিন");

    const expected = hashCode(data.code, mobile);
    const a = Buffer.from(expected);
    const b = Buffer.from(row.code_hash);
    const match = a.length === b.length && timingSafeEqual(a, b);
    if (!match) {
      await sb.from("sms_otp_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      throw new Error("কোড ভুল হয়েছে");
    }
    await sb.from("sms_otp_codes").update({ used: true }).eq("id", row.id);

    const { error: updateErr } = await sb
      .from("admin_credentials")
      .update({
        pin: data.newPin,
        updated_at: new Date().toISOString(),
      })
      .eq("mobile", mobile);

    if (updateErr) {
      throw new Error(updateErr.message || "পিন পরিবর্তন করতে সমস্যা হয়েছে");
    }

    const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email: row.email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      throw new Error(linkErr?.message || "লগইন সেশন তৈরি ব্যর্থ");
    }

    return {
      ok: true,
      email: row.email,
      mobile,
      tokenHash: linkData.properties.hashed_token,
    };
  });
