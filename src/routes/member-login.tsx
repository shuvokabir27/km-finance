import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MemberOtpGate } from "@/components/member-otp-gate";

export const Route = createFileRoute("/member-login")({
  component: MemberLogin,
  head: () => ({
    meta: [
      { title: "সদস্য লগইন — Kuakata Multimedia Finance" },
      { name: "description", content: "মোবাইল নম্বর ও OTP দিয়ে নিজের প্রফাইলে ঢুকুন" },
      { property: "og:title", content: "সদস্য লগইন — Kuakata Multimedia Finance" },
      { property: "og:description", content: "মোবাইল নম্বর ও OTP দিয়ে নিজের প্রফাইলে ঢুকুন" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function MemberLogin() {
  const navigate = useNavigate();
  return (
    <MemberOtpGate
      error={null}
      onLogin={(session, memberId) => {
        localStorage.setItem(`km-member-session:${memberId}`, session);
        navigate({ to: "/p/$memberId", params: { memberId }, search: { t: "" } });
      }}
    />
  );
}
