import { createServerFn } from "@tanstack/react-start";
import { createHash, randomInt, timingSafeEqual } from "crypto";

const normalizeMobile = (m: string) => (m || "").replace(/\D/g, "").slice(-11);
const hashCode = (code: string, mobile: string) =>
  createHash("sha256").update(`member:${mobile}:${code}`).digest("hex");

async function sendSms(mobile: string, message: string) {
  const apiKey = process.env.BULKSMSBD_API_KEY;
  const senderId = process.env.BULKSMSBD_SENDER_ID;
  if (!apiKey || !senderId) throw new Error("SMS সার্ভিস সেট করা নেই");
  const body = new URLSearchParams();
  body.set("api_key", apiKey);
  body.set("type", "text");
  body.set("number", mobile.startsWith("0") ? `880${mobile.slice(1)}` : mobile);
  body.set("senderid", senderId);
  body.set("message", message);
  const res = await fetch("https://bulksmsbd.net/api/smsapi", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body,
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch {}
  if (!res.ok || parsed?.response_code !== 202) {
    console.error("[member-otp] sms failed", res.status, text);
    throw new Error("SMS পাঠাতে ব্যর্থ, একটু পরে চেষ্টা করুন");
  }
}

async function findMember(mobile: string, memberId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const last10 = mobile.slice(-10);
  const { data, error } = await supabaseAdmin
    .from("members")
    .select("id,phone,created_at")
    .ilike("phone", `%${last10}`)
    .order("created_at", { ascending: true });
  if (error) throw new Error("সার্ভারে সমস্যা");
  const list = (data ?? []).filter((m) => normalizeMobile(m.phone ?? "") === mobile);
  const m = memberId ? list.find((x) => x.id === memberId) : list[0];
  return { member: m ?? null, supabaseAdmin };
}

function getStartOfTodayBD(): string {
  const now = new Date();
  // Bangladesh timezone is UTC+6
  const bdTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  const y = bdTime.getUTCFullYear();
  const m = String(bdTime.getUTCMonth() + 1).padStart(2, "0");
  const d = String(bdTime.getUTCDate()).padStart(2, "0");
  return new Date(`${y}-${m}-${d}T00:00:00+06:00`).toISOString();
}

export const requestMemberOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { mobile: string; memberId?: string }) => ({
    mobile: normalizeMobile(d?.mobile),
    memberId: typeof d?.memberId === "string" && /^[0-9a-f-]{36}$/i.test(d.memberId) ? d.memberId : undefined,
  }))
  .handler(async ({ data }) => {
    if (!/^01\d{9}$/.test(data.mobile)) throw new Error("সঠিক মোবাইল নম্বর দিন");
    const { member, supabaseAdmin } = await findMember(data.mobile, data.memberId);
    if (!member) throw new Error("এই মোবাইল নম্বরে কোনো সদস্য পাওয়া যায়নি");

    const key = `m:${data.mobile}`;
    const startOfToday = getStartOfTodayBD();

    // Check daily OTP limit (maximum 2 OTPs per number per day)
    const { count: dailyCount } = await supabaseAdmin
      .from("sms_otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("mobile", key)
      .gte("created_at", startOfToday);

    const sentToday = dailyCount ?? 0;
    const DAILY_LIMIT = 2;

    if (sentToday >= DAILY_LIMIT) {
      throw new Error("আপনার আজকের OTP লিমিট শেষ হয়ে গেছে (সর্বোচ্চ ২টি)। অনুগ্রহ করে আগামীকাল আবার চেষ্টা করুন। (Try next day for OTP, your limit is end)");
    }

    const { data: recent } = await supabaseAdmin
      .from("sms_otp_codes").select("created_at").eq("mobile", key)
      .order("created_at", { ascending: false }).limit(1);
    if (recent?.[0] && Date.now() - new Date(recent[0].created_at).getTime() < 60_000) {
      throw new Error("১ মিনিট পর আবার চেষ্টা করুন");
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await supabaseAdmin.from("sms_otp_codes").update({ used: true }).eq("mobile", key).eq("used", false);
    const { error } = await supabaseAdmin.from("sms_otp_codes").insert({
      mobile: key,
      email: `member:${member.id}`,
      code_hash: hashCode(code, data.mobile),
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
    if (error) throw new Error("সার্ভারে সমস্যা");
    await sendSms(data.mobile, `Kuakata Multimedia profile login code: ${code}. Valid 5 minutes. Do not share.`);
    const remainingToday = Math.max(0, DAILY_LIMIT - (sentToday + 1));
    return {
      ok: true,
      masked: data.mobile.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2"),
      remainingToday,
    };
  });

export const verifyMemberOtp = createServerFn({ method: "POST" })
  .inputValidator((d: { mobile: string; code: string }) => ({
    mobile: normalizeMobile(d?.mobile),
    code: String(d?.code ?? "").trim(),
  }))
  .handler(async ({ data }) => {
    if (!/^\d{6}$/.test(data.code)) throw new Error("৬ ডিজিটের কোড দিন");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = `m:${data.mobile}`;
    const { data: rows } = await supabaseAdmin
      .from("sms_otp_codes").select("*").eq("mobile", key).eq("used", false)
      .order("created_at", { ascending: false }).limit(1);
    const row = rows?.[0];
    if (!row) throw new Error("কোড পাওয়া যায়নি, আবার কোড নিন");
    if (new Date(row.expires_at).getTime() < Date.now()) throw new Error("কোডের মেয়াদ শেষ");
    if (row.attempts >= 5) throw new Error("অনেকবার ভুল হয়েছে, আবার কোড নিন");
    const a = Buffer.from(hashCode(data.code, data.mobile));
    const b = Buffer.from(row.code_hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await supabaseAdmin.from("sms_otp_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      throw new Error("কোড ভুল");
    }
    await supabaseAdmin.from("sms_otp_codes").update({ used: true }).eq("id", row.id);
    const memberId = row.email.replace(/^member:/, "");
    const { createMemberSession } = await import("./member-session.server");
    return { memberId, session: createMemberSession(memberId) };
  });
