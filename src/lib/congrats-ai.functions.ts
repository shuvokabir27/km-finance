import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

const Input = z.object({
  memberName: z.string().min(1),
  role: z.string().nullable().optional(),
  oldSalary: z.number().nonnegative(),
  newSalary: z.number().nonnegative(),
  hint: z.string().max(500).optional().default(""),
});

export const generateCongratsMessage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const key =
      process.env.OPENAI_API_KEY ||
      process.env.AI_API_KEY ||
      process.env.LOVABLE_API_KEY;

    // Fallback templates in Bangla if no AI API key is set
    if (!key) {
      const templates = [
        `কুয়াকাটা মাল্টিমিডিয়ার সাথে আপনার নিষ্ঠা ও অবিচল পথচলার জন্য আন্তরিক কৃতজ্ঞতা। আপনার দায়িত্বশীলতা ও পরিশ্রমের স্বীকৃতি হিসেবে বেতন বৃদ্ধি করা হলো। ভবিষ্যতে আমাদের পথচলা আরো সমৃদ্ধ হোক।`,
        `আপনার একনিষ্ঠ কর্মদক্ষতা ও দলের প্রতি অনন্য অবদানের জন্য আন্তরিক অভিনন্দন। নতুন উদ্দীপনায় আমাদের সাথে এগিয়ে চলার জন্য এই সম্মাননা। আপনার সার্বিক সাফল্য কামনা করি!`,
        `প্রতিষ্ঠানের উন্নয়নে আপনার একাগ্র প্রচেষ্টা সবসময়ই প্রশংসনীয়। আপনার কঠোর পরিশ্রম ও দায়িত্ববোধকে সম্মান জানিয়ে বেতন বৃদ্ধি করা হলো। শুভকামনা সর্বদা!`,
      ];
      const randomIndex = Math.floor(Math.random() * templates.length);
      return { message: templates[randomIndex] };
    }

    const { createAiGatewayProvider } = await import("./ai-gateway.server");
    const gateway = createAiGatewayProvider(key);

    const diff = data.newSalary - data.oldSalary;
    const pct = data.oldSalary > 0 ? ((diff / data.oldSalary) * 100).toFixed(1) : "";

    const prompt = `তুমি Kuakata Multimedia-এর পক্ষে একজন সদস্যের বেতন বৃদ্ধির শুভেচ্ছা বার্তা লিখবে।
সদস্যের নাম: ${data.memberName}
পদ: ${data.role ?? "—"}
পূর্বের বেতন: ${data.oldSalary} টাকা
নতুন বেতন: ${data.newSalary} টাকা
বৃদ্ধি: ${diff} টাকা${pct ? ` (${pct}%)` : ""}

ব্যবহারকারীর সংক্ষিপ্ত ইঙ্গিত: "${data.hint || "(কোনো ইঙ্গিত নেই)"}"

নিয়ম:
- শুধুমাত্র বাংলায় লিখো।
- ২–৩টি সংক্ষিপ্ত বাক্য, উষ্ণ ও আন্তরিক টোন।
- নাম, পদ বা টাকার অংক বার্তায় উল্লেখ করবে না (কার্ডে আলাদা আছে)।
- ইমোজি ব্যবহার করবে না।
- কোনো শিরোনাম বা bullet নয়, শুধু paragraph।
- সর্বোচ্চ ৩৫০ অক্ষর।
শুধু বার্তাটিই output করো, অন্য কিছু না।`;

    const modelName = process.env.AI_MODEL || "gpt-4o-mini";
    const { text } = await generateText({
      model: gateway(modelName),
      prompt,
    });

    return { message: text.trim() };
  });

