import { createServerFn } from "@tanstack/react-start";

const PHOTO_BUCKET = "member-photos";

export type PublicAccount = {
  id: string;
  kind: string;
  bank_name: string | null;
  branch: string | null;
  account_holder: string | null;
  account_number: string;
};

export type PublicPayment = {
  id: string;
  amount: number;
  paid_at: string;
  note: string | null;
  method: string | null;
  bank_account_number: string | null;
  channel_id: string | null;
};

export type PublicSalary = {
  id: string;
  amount: number;
  month: string;
};

export type PublicBonus = {
  id: string;
  amount: number;
  note: string | null;
  given_at: string;
};

export type PublicShooting = {
  id: string;
  name: string;
  shoot_date: string;
  director: string | null;
  channel: string | null;
  location: string | null;
  earned: number;
};

export type PublicChannelAccount = {
  id: string;
  name: string;
  earned: number;
  paid: number;
  balance: number;
  shootings: PublicShooting[];
  payments: PublicPayment[];
};

export type PublicProfile = {
  member: {
    id: string;
    name: string;
    role: string | null;
    type: "daily" | "monthly";
    rate: number;
    photo_signed_url: string | null;
    has_phone: boolean;
    phone_masked: string | null;
  };
  range: { from: string | null; to: string | null };
  balance: number;
  general_balance: number;
  channel_accounts: PublicChannelAccount[];
  accounts: PublicAccount[];
  payments: PublicPayment[];
  salaries: PublicSalary[];
  bonuses: PublicBonus[];
  shootings: PublicShooting[];
  shootings_count: number;
};

export function _unusedTimingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function _unusedAssertShareWindow(from: string | null, to: string | null) {
  const today = new Date().toISOString().slice(0, 10);
  if (from && today < from) throw new Error("এই লিংকটি এখনো সক্রিয় হয়নি");
  if (to && today > to) throw new Error("এই লিংকটির মেয়াদ শেষ হয়েছে");
}

export const getPublicProfile = createServerFn({ method: "GET" })
  .inputValidator((data: { memberId: string; token?: string }) => {
    if (!data?.memberId || typeof data.memberId !== "string") {
      throw new Error("memberId দরকার");
    }
    if (!/^[0-9a-f-]{36}$/i.test(data.memberId)) throw new Error("লিংকটি সঠিক নয়");
    const token = typeof data.token === "string" ? data.token.slice(0, 300) : "";
    return { memberId: data.memberId, token };
  })
  .handler(async ({ data }): Promise<PublicProfile> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: member, error: mErr } = await supabaseAdmin
      .from("members")
      .select("id,owner_id,name,role,type,rate,phone,photo_url,share_token,share_enabled,share_from,share_to")
      .eq("id", data.memberId)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!member) throw new Error("সদস্য পাওয়া যায়নি");
    const { assertMemberSession } = await import("./member-session.server");
    assertMemberSession(member.id, data.token);

    const from: string | null = null;
    const to: string | null = null;


    // Attendance (present only) within range, join shootings
    let attQ = supabaseAdmin
      .from("attendance")
      .select("id,rate_override,shooting_id,shootings!inner(id,name,shoot_date,director,channel,location)")
      .eq("member_id", member.id)
      .eq("present", true);
    if (from) attQ = attQ.gte("shootings.shoot_date", from);
    if (to) attQ = attQ.lte("shootings.shoot_date", to);

    let paymentsQ = supabaseAdmin
      .from("payments")
      .select("id,amount,paid_at,note,method,bank_account_number,channel_id")
      .eq("member_id", member.id)
      .order("paid_at", { ascending: false });
    if (from) paymentsQ = paymentsQ.gte("paid_at", from);
    if (to) paymentsQ = paymentsQ.lte("paid_at", to);

    let salariesQ = supabaseAdmin
      .from("monthly_salaries")
      .select("id,amount,month")
      .eq("member_id", member.id)
      .order("month", { ascending: false });
    if (from) salariesQ = salariesQ.gte("month", from);
    if (to) salariesQ = salariesQ.lte("month", to);

    let bonusesQ = supabaseAdmin
      .from("bonuses")
      .select("id,amount,note,given_at")
      .eq("member_id", member.id)
      .order("given_at", { ascending: false });
    if (from) bonusesQ = bonusesQ.gte("given_at", from);
    if (to) bonusesQ = bonusesQ.lte("given_at", to);

    const [accountsRes, attendanceRes, paymentsRes, salariesRes, bonusesRes, channelsRes] = await Promise.all([
      supabaseAdmin
        .from("member_accounts")
        .select("id,kind,bank_name,branch,account_holder,account_number")
        .eq("member_id", member.id)
        .order("created_at", { ascending: true }),
      attQ,
      paymentsQ,
      salariesQ,
      bonusesQ,
      supabaseAdmin
        .from("channels")
        .select("id,name")
        .eq("owner_id", member.owner_id)
        .eq("is_shared", true)
        .order("name"),
    ]);

    let photoSignedUrl: string | null = null;
    if (member.photo_url) {
      const { data: signed } = await supabaseAdmin.storage
        .from(PHOTO_BUCKET)
        .createSignedUrl(member.photo_url, 60 * 60);
      photoSignedUrl = signed?.signedUrl ?? null;
    }

    const rate = Number(member.rate ?? 0);
    const shootings: PublicShooting[] = (attendanceRes.data ?? []).map((a: any) => {
      const sh = Array.isArray(a.shootings) ? a.shootings[0] : a.shootings;
      return {
        id: sh?.id ?? a.shooting_id,
        name: sh?.name ?? "",
        shoot_date: sh?.shoot_date ?? "",
        director: sh?.director ?? null,
        channel: sh?.channel ?? null,
        location: sh?.location ?? null,
        earned: Number(a.rate_override ?? rate),
      };
    }).sort((a, b) => (a.shoot_date < b.shoot_date ? 1 : -1));

    const salaries = (salariesRes.data ?? []).map((s: any) => ({
      id: s.id, amount: Number(s.amount), month: s.month,
    }));
    const bonuses = (bonusesRes.data ?? []).map((b: any) => ({
      id: b.id, amount: Number(b.amount), note: b.note, given_at: b.given_at,
    }));
    const payments = (paymentsRes.data ?? []).map((p: any) => ({
      id: p.id, amount: Number(p.amount), paid_at: p.paid_at, note: p.note,
      method: p.method ?? null, bank_account_number: p.bank_account_number ?? null,
      channel_id: p.channel_id ?? null,
    }));

    const sharedChannels = (channelsRes.data ?? []).map((c: any) => ({
      id: c.id as string,
      name: c.name as string,
    }));
    const sharedNames = new Set(sharedChannels.map((c) => c.name));
    const generalShootings = shootings.filter((s) => !s.channel || !sharedNames.has(s.channel));
    const generalPayments = payments.filter((p) => !p.channel_id);

    // Keep general and shared-channel balances separate, matching member_balance().
    const generalEarned = member.type === "daily"
      ? generalShootings.reduce((s, x) => s + x.earned, 0)
      : salaries.reduce((s, x) => s + x.amount, 0);
    const bonusSum = bonuses.reduce((s, x) => s + x.amount, 0);
    const generalPaid = generalPayments.reduce((s, x) => s + x.amount, 0);
    const generalBalance = generalEarned + bonusSum - generalPaid;
    const channelAccounts: PublicChannelAccount[] = sharedChannels
      .map((channel) => {
        const channelShootings = shootings.filter((s) => s.channel === channel.name);
        const channelPayments = payments.filter((p) => p.channel_id === channel.id);
        const earned = member.type === "daily"
          ? channelShootings.reduce((sum, s) => sum + s.earned, 0)
          : 0;
        const paid = channelPayments.reduce((sum, p) => sum + p.amount, 0);
        return {
          ...channel,
          earned,
          paid,
          balance: earned - paid,
          shootings: channelShootings,
          payments: channelPayments,
        };
      })
      .filter((channel) => channel.shootings.length > 0 || channel.payments.length > 0);
    const balance = generalBalance + channelAccounts.reduce((sum, channel) => sum + channel.balance, 0);

    const phone = member.phone ?? null;
    const phoneMasked = phone && phone.length >= 4
      ? `${"X".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`
      : null;

    return {
      member: {
        id: member.id,
        name: member.name,
        role: member.role,
        type: member.type as "daily" | "monthly",
        rate,
        photo_signed_url: photoSignedUrl,
        has_phone: !!phone,
        phone_masked: phoneMasked,
      },
      range: { from, to },
      balance,
      general_balance: generalBalance,
      channel_accounts: channelAccounts,
      accounts: (accountsRes.data ?? []) as PublicAccount[],
      payments,
      salaries,
      bonuses,
      shootings,
      shootings_count: shootings.length,
    };
  });

const ALLOWED_KINDS = ["bkash", "nagad", "rocket", "upay", "bank"] as const;
type AllowedKind = (typeof ALLOWED_KINDS)[number];

async function verifyMemberForPublicWrite(memberId: string, token: string, last4: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: member, error } = await supabaseAdmin
    .from("members")
    .select("id,owner_id,phone,photo_url,share_token,share_enabled,share_from,share_to")
    .eq("id", memberId)
    .maybeSingle();
  if (error) throw error;
  if (!member) throw new Error("সদস্য পাওয়া যায়নি");
  const { assertMemberSession } = await import("./member-session.server");
  assertMemberSession(member.id, token);
  if (!member.phone || member.phone.length < 4) {
    throw new Error("এই সদস্যের ফোন নম্বর সেট নেই, এডমিনকে জানান");
  }
  if (member.phone.slice(-4) !== last4) {
    throw new Error("ফোন নম্বরের শেষ ৪ ডিজিট মিলেনি");
  }
  return { member, supabaseAdmin };
}

export const updatePublicProfilePhoto = createServerFn({ method: "POST" })
  .inputValidator((data: {
    memberId: string;
    token?: string;
    last4: string;
    fileBase64: string;
    contentType: string;
    ext: string;
  }) => {
    if (!data?.memberId) throw new Error("memberId দরকার");
    if (!/^[0-9]{4}$/.test(data.last4 || "")) throw new Error("সঠিক ৪ ডিজিট দিন");
    if (!data.fileBase64) throw new Error("ছবি দরকার");
    if (!data.contentType?.startsWith("image/")) throw new Error("শুধু ছবি আপলোড করা যাবে");
    const ext = (data.ext || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
    return { ...data, token: typeof data.token === "string" ? data.token.slice(0, 300) : "", ext };
  })
  .handler(async ({ data }) => {
    const { member, supabaseAdmin } = await verifyMemberForPublicWrite(
      data.memberId, data.token, data.last4,
    );

    const bytes = Uint8Array.from(atob(data.fileBase64), (c) => c.charCodeAt(0));
    if (bytes.byteLength > 5 * 1024 * 1024) {
      throw new Error("ছবি ৫ MB এর বেশি হতে পারবে না");
    }

    const path = `${member.owner_id}/${member.id}-${Date.now()}.${data.ext}`;
    let up = await supabaseAdmin.storage
      .from(PHOTO_BUCKET)
      .upload(path, bytes, { contentType: data.contentType, upsert: false });
    if (up.error && (up.error.message?.includes("Bucket not found") || (up.error as { statusCode?: string }).statusCode === "404")) {
      await supabaseAdmin.storage.createBucket(PHOTO_BUCKET, { public: false });
      up = await supabaseAdmin.storage
        .from(PHOTO_BUCKET)
        .upload(path, bytes, { contentType: data.contentType, upsert: false });
    }
    if (up.error) throw up.error;

    if (member.photo_url) {
      await supabaseAdmin.storage.from(PHOTO_BUCKET).remove([member.photo_url]);
    }
    const upd = await supabaseAdmin.from("members").update({ photo_url: path }).eq("id", member.id);
    if (upd.error) throw upd.error;

    const { data: signed } = await supabaseAdmin.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(path, 60 * 60);

    return { ok: true, photo_signed_url: signed?.signedUrl ?? null };
  });


export const addPublicMemberAccount = createServerFn({ method: "POST" })
  .inputValidator((data: {
    memberId: string;
    token: string;
    last4: string;
    kind: string;
    account_number: string;
    account_holder?: string | null;
    bank_name?: string | null;
    branch?: string | null;
  }) => {
    if (!data?.memberId) throw new Error("memberId দরকার");
    if (!/^[0-9]{4}$/.test(data.last4 || "")) throw new Error("সঠিক ৪ ডিজিট দিন");
    if (!ALLOWED_KINDS.includes(data.kind as AllowedKind)) throw new Error("ধরন সঠিক নয়");
    const acc = (data.account_number || "").trim();
    if (acc.length < 4 || acc.length > 40) throw new Error("একাউন্ট নম্বর সঠিক নয়");
    if (data.kind === "bank") {
      if (!data.bank_name?.trim()) throw new Error("ব্যাংকের নাম দিন");
    }
    return {
      memberId: data.memberId,
      token: data.token ?? "",
      last4: data.last4,
      kind: data.kind as AllowedKind,
      account_number: acc,
      account_holder: (data.account_holder || "").trim().slice(0, 120) || null,
      bank_name: data.kind === "bank" ? (data.bank_name || "").trim().slice(0, 120) : null,
      branch: data.kind === "bank" ? ((data.branch || "").trim().slice(0, 120) || null) : null,
    };
  })
  .handler(async ({ data }) => {
    const { member, supabaseAdmin } = await verifyMemberForPublicWrite(
      data.memberId, data.token, data.last4,
    );

    // Cap how many accounts a member can self-add (prevents abuse via token).
    const { count } = await supabaseAdmin
      .from("member_accounts")
      .select("id", { count: "exact", head: true })
      .eq("member_id", member.id);
    if ((count ?? 0) >= 10) throw new Error("সর্বোচ্চ ১০টি একাউন্ট যোগ করা যাবে");

    const { error } = await supabaseAdmin.from("member_accounts").insert({
      owner_id: member.owner_id,
      member_id: member.id,
      kind: data.kind,
      account_number: data.account_number,
      account_holder: data.account_holder,
      bank_name: data.bank_name,
      branch: data.branch,
    });
    if (error) throw error;
    return { ok: true };
  });

export const deletePublicMemberAccount = createServerFn({ method: "POST" })
  .inputValidator((data: { memberId: string; token: string; last4: string; accountId: string }) => {
    if (!data?.memberId || !data?.accountId) throw new Error("ইনপুট সঠিক নয়");
    if (!/^[0-9]{4}$/.test(data.last4 || "")) throw new Error("সঠিক ৪ ডিজিট দিন");
    return { memberId: data.memberId, token: data.token ?? "", last4: data.last4, accountId: data.accountId };
  })
  .handler(async ({ data }) => {
    const { member, supabaseAdmin } = await verifyMemberForPublicWrite(
      data.memberId, data.token, data.last4,
    );
    const { error } = await supabaseAdmin
      .from("member_accounts")
      .delete()
      .eq("id", data.accountId)
      .eq("member_id", member.id);
    if (error) throw error;
    return { ok: true };
  });
