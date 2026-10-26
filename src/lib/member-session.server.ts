import { createHmac, timingSafeEqual } from "crypto";

const TTL_MS = 30 * 24 * 60 * 60 * 1000;

function secret() {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error("Server not configured");
  return `member-session:${s}`;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("hex");
}

export function createMemberSession(memberId: string) {
  const exp = Date.now() + TTL_MS;
  const payload = `${memberId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** Throws unless the session is a valid, unexpired session for memberId. */
export function assertMemberSession(memberId: string, session: string) {
  const parts = (session || "").split(".");
  if (parts.length !== 3) throw new Error("লগইন প্রয়োজন");
  const [id, expStr, sig] = parts;
  const expected = sign(`${id}.${expStr}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error("লগইন প্রয়োজন");
  if (id !== memberId) throw new Error("লগইন প্রয়োজন");
  if (!(Number(expStr) > Date.now())) throw new Error("সেশনের মেয়াদ শেষ, আবার লগইন করুন");
}
