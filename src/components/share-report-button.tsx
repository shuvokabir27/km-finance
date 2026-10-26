import { useState } from "react";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function ShareReportButton({
  channelId,
  from,
  to,
  shootingId,
}: {
  channelId: string;
  from: string | null;
  to: string | null;
  shootingId: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("লগইন দরকার");
      const { data, error } = await supabase
        .from("shared_channel_reports")
        .insert({ owner_id: u.user.id, channel_id: channelId, date_from: from, date_to: to, shooting_id: shootingId })
        .select("id, token")
        .single();
      if (error) throw error;
      const url = `${window.location.origin}/r/${data.id}?t=${data.token}`;
      if (navigator.share) {
        try { await navigator.share({ title: "শেয়ার চ্যানেল রিপোর্ট", url }); } catch { /* cancelled */ }
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("রিপোর্ট লিংক কপি হয়েছে");
      }
      window.open(url, "_blank");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button onClick={create} disabled={busy} variant="outline" className="w-full">
      <Share2 className="mr-1 h-4 w-4" /> {busy ? "তৈরি হচ্ছে..." : "রিপোর্ট তৈরি ও লিংক শেয়ার"}
    </Button>
  );
}
