import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** অ্যাডমিন কোনো সদস্যের প্রোফাইল (সদস্যের ভিউ) সরাসরি দেখতে পারে — OTP ছাড়া।
 *  কলার আগে অ্যাডমিন কিনা যাচাই করা হয়, তারপর সদস্য সেশন টোকেন বানানো হয়। */
export const mintMemberSessionForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { memberId: string }) => {
    if (!data?.memberId || !/^[0-9a-f-]{36}$/i.test(data.memberId)) throw new Error("সদস্য সঠিক নয়");
    return { memberId: data.memberId };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("শুধু অ্যাডমিন এটি করতে পারবেন");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member, error } = await supabaseAdmin
      .from("members")
      .select("id")
      .eq("id", data.memberId)
      .maybeSingle();
    if (error) throw error;
    if (!member) throw new Error("সদস্য পাওয়া যায়নি");

    const { createMemberSession } = await import("./member-session.server");
    return { session: createMemberSession(member.id) };
  });
