import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPlanInfo } from "@/lib/account.functions";

export const planQuery = queryOptions({ queryKey: ["plan"], queryFn: () => getPlanInfo() });

export const keysQuery = queryOptions({
  queryKey: ["api-keys"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("api_keys_public")
      .select("id, label, key_prefix, created_at, last_used_at, revoked_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },
});

export type UsageRow = {
  id: string;
  request_id: string;
  source: string;
  status: string;
  input_tokens: number | null;
  output_tokens: number | null;
  tokens_estimated: boolean;
  error_code: string | null;
  created_at: string;
  api_key_id: string | null;
};

export const usageQuery = (fromIso: string, page = 0) =>
  queryOptions({
    queryKey: ["usage", fromIso, page],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_records")
        .select("id, request_id, source, status, input_tokens, output_tokens, tokens_estimated, error_code, created_at, api_key_id")
        .gte("created_at", fromIso)
        .order("created_at", { ascending: false })
        .range(page * 100, page * 100 + 99);
      if (error) throw error;
      return (data ?? []) as UsageRow[];
    },
  });
