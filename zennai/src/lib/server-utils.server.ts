import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPlanConfig } from "@/lib/config.server";

export function newRequestId() {
  return "req_" + crypto.randomUUID().replace(/-/g, "");
}

export async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (const b of bytes) s += alphabet[b % 62];
  // 62^32 ≈ 190 bits; tiny modulo bias is irrelevant at this entropy.
  return "zenn_sk_" + s;
}

/** Verifies a Supabase session access token from an Authorization header. */
export async function getUserFromBearer(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (token.split(".").length !== 3) return null;
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client.auth.getClaims(token);
  if (error || !data?.claims?.sub) return null;
  return data.claims.sub as string;
}

export type ApiKeyAuth = { userId: string; apiKeyId: string };

export async function authenticateApiKey(authHeader: string | null): Promise<ApiKeyAuth | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const key = authHeader.slice(7).trim();
  if (!/^zenn_sk_[A-Za-z0-9]{32}$/.test(key)) return null;
  const hash = await sha256Hex(key);
  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id, user_id, key_hash, revoked_at")
    .eq("key_hash", hash)
    .maybeSingle();
  if (!data || data.revoked_at || !timingSafeEqual(data.key_hash, hash)) return null;
  await supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { userId: data.user_id, apiKeyId: data.id };
}

export type QuotaResult = { ok: true; used: number; limit: number } | { ok: false; reason: "rate_limited" | "quota_exceeded" };

export async function consumeQuota(userId: string, apiKeyId: string | null): Promise<QuotaResult> {
  const plan = getPlanConfig();
  const { data, error } = await supabaseAdmin.rpc("consume_quota", {
    _user_id: userId,
    _api_key_id: apiKeyId as string,
    _daily_limit: plan.dailyRequests,
    _user_per_minute: plan.userPerMinute,
    _key_per_minute: plan.keyPerMinute,
  });
  if (error) throw new Error("quota check failed");
  return data as unknown as QuotaResult;
}

export function nextUtcMidnight() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

export async function recordUsage(r: {
  userId: string;
  apiKeyId: string | null;
  requestId: string;
  source: "web" | "api";
  status: "success" | "error" | "cancelled" | "rejected";
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimated?: boolean | undefined;
  errorCode?: string | undefined;
}) {
  const { error } = await supabaseAdmin.from("usage_records").insert({
    user_id: r.userId,
    api_key_id: r.apiKeyId,
    request_id: r.requestId,
    source: r.source,
    model_alias: "zennai",
    status: r.status,
    input_tokens: r.inputTokens ?? null,
    output_tokens: r.outputTokens ?? null,
    tokens_estimated: r.estimated ?? false,
    error_code: r.errorCode ?? null,
  });
  if (error) console.error("[usage] record failed", error.message);
}
