import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getPlanInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getPlanConfig } = await import("@/lib/config.server");
    const { isProviderConfigured } = await import("@/lib/ai/provider.server");
    const { nextUtcMidnight } = await import("@/lib/server-utils.server");
    const plan = getPlanConfig();
    const today = new Date().toISOString().slice(0, 10);
    const { data } = await context.supabase
      .from("usage_daily")
      .select("request_count")
      .eq("user_id", context.userId)
      .eq("day", today)
      .maybeSingle();
    const used = data?.request_count ?? 0;
    return {
      dailyRequests: plan.dailyRequests,
      userPerMinute: plan.userPerMinute,
      keyPerMinute: plan.keyPerMinute,
      maxInputChars: plan.maxInputChars,
      maxOutputTokens: plan.maxOutputTokens,
      usedToday: used,
      remaining: Math.max(0, plan.dailyRequests - used),
      resetsAt: nextUtcMidnight(),
      aiConfigured: isProviderConfigured(),
    };
  });

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ label: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    const { getPlanConfig } = await import("@/lib/config.server");
    const { generateApiKey, sha256Hex } = await import("@/lib/server-utils.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const plan = getPlanConfig();
    const { count } = await supabaseAdmin
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("revoked_at", null);
    if ((count ?? 0) >= plan.maxActiveKeys)
      throw new Error(`You can have at most ${plan.maxActiveKeys} active keys. Revoke one first.`);
    const { data: allowed } = await supabaseAdmin.rpc("hit_rate_limit", {
      _bucket: "keycreate:" + context.userId,
      _limit: plan.keyCreatePerHour,
      _window_seconds: 3600,
    });
    if (!allowed) throw new Error("Too many keys created recently. Try again in an hour.");
    const key = generateApiKey();
    const hash = await sha256Hex(key);
    const prefix = key.slice(0, 12) + "…" + key.slice(-4);
    const { data: row, error } = await supabaseAdmin
      .from("api_keys")
      .insert({ user_id: context.userId, label: data.label, key_prefix: prefix, key_hash: hash })
      .select("id, label, key_prefix, created_at")
      .single();
    if (error || !row) throw new Error("Could not create key.");
    return { ...row, key };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("revoked_at", null)
      .select("id");
    if (error) throw new Error("Could not revoke key.");
    if (!rows?.length) throw new Error("Key not found.");
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ confirm: z.literal("DELETE") }).parse(d))
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uid = context.userId;
    await supabaseAdmin.from("conversations").delete().eq("user_id", uid);
    await supabaseAdmin.from("usage_records").delete().eq("user_id", uid);
    await supabaseAdmin.from("api_keys").delete().eq("user_id", uid);
    await supabaseAdmin.from("usage_daily").delete().eq("user_id", uid);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
    if (error) throw new Error("Could not delete account. Please try again.");
    return { ok: true };
  });
