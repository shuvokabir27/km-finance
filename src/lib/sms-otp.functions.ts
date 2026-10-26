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
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
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
