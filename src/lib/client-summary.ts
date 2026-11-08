import { supabase } from "@/integrations/supabase/client";

export type ClientSummaryItem = {
  channel: string;
  shooting_count: number;
  contract: number;
  received: number;
  due: number;
  contract_total: number;
  received_total: number;
  due_total: number;
};

const STORAGE_KEY = "km_cache_client_summary_v1";

export function getCachedClientSummary(): ClientSummaryItem[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Ignore cache parse error
  }
  return undefined;
}

export function saveCachedClientSummary(data: ClientSummaryItem[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota error
  }
}

export async function fetchClientSummary(): Promise<ClientSummaryItem[]> {
  const { data, error } = await supabase.rpc("client_channel_summary");
  if (error) throw error;
  const list: ClientSummaryItem[] = ((data ?? []) as Array<{
    channel: string;
    shooting_count?: number;
    contract_total?: number;
    received_total?: number;
    due_total?: number;
  }>).map((r) => {
    const shooting_count = Number(r.shooting_count ?? 0);
    const contract = Number(r.contract_total ?? 0);
    const received = Number(r.received_total ?? 0);
    const due = Number(r.due_total ?? 0);
    return {
      channel: String(r.channel),
      shooting_count,
      contract,
      received,
      due,
      contract_total: contract,
      received_total: received,
      due_total: due,
    };
  });

  saveCachedClientSummary(list);
  return list;
}
