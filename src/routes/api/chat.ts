import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Website chat endpoint (same origin). Authenticated with the user's session token.
// Streams Server-Sent Events: meta → delta* → done | error.

const Body = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  content: z.string().max(100_000).optional(),
  clientMessageId: z.string().min(8).max(64),
  regenerate: z.boolean().optional(),
});

function jsonError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: { code, message, ...extra } }, { status });
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { getUserFromBearer, consumeQuota, newRequestId, recordUsage, nextUtcMidnight } = await import(
          "@/lib/server-utils.server"
        );
        const { getPlanConfig } = await import("@/lib/config.server");
        const { streamChat, SYSTEM_PROMPT, ProviderError, estimateTokens, isProviderConfigured } = await import(
          "@/lib/ai/provider.server"
        );
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const plan = getPlanConfig();
        const requestId = newRequestId();

        const userId = await getUserFromBearer(request.headers.get("authorization"));
        if (!userId) return jsonError(401, "session_expired", "Your session has expired. Please sign in again.");

        const raw = await request.text();
        if (raw.length > plan.maxBodyBytes) return jsonError(413, "payload_too_large", "Request is too large.");
        let parsed: z.infer<typeof Body>;
        try {
          parsed = Body.parse(JSON.parse(raw));
        } catch {
          return jsonError(400, "invalid_request", "Invalid request body.");
        }
        const content = parsed.content?.trim() ?? "";
        if (!parsed.regenerate && !content) return jsonError(400, "invalid_request", "Message cannot be empty.");
        if (content.length > plan.maxInputChars)
          return jsonError(400, "input_too_long", `Message exceeds ${plan.maxInputChars} characters.`);
        if (!isProviderConfigured())
          return jsonError(503, "not_configured", "AI is not set up yet. The site owner needs to add the AI_API_KEY secret.");

        // Ownership check for an existing conversation
        let conversationId = parsed.conversationId ?? null;
        if (conversationId) {
          const { data: conv } = await supabaseAdmin
            .from("conversations")
            .select("id, user_id")
            .eq("id", conversationId)
            .maybeSingle();
          if (!conv || conv.user_id !== userId) return jsonError(404, "not_found", "Conversation not found.");
        } else if (parsed.regenerate) {
          return jsonError(400, "invalid_request", "Nothing to regenerate.");
        }

        // Duplicate-submit protection: same clientMessageId already stored → reject
        if (conversationId && !parsed.regenerate) {
          const { data: dup } = await supabaseAdmin
            .from("messages")
            .select("id")
            .eq("conversation_id", conversationId)
            .eq("client_message_id", parsed.clientMessageId)
            .maybeSingle();
          if (dup) return jsonError(409, "duplicate_request", "This message was already sent.");
        }

        const quota = await consumeQuota(userId, null);
        if (!quota.ok) {
          await recordUsage({ userId, apiKeyId: null, requestId, source: "web", status: "rejected", errorCode: quota.reason });
          return quota.reason === "quota_exceeded"
            ? jsonError(429, "quota_exceeded", `You've used all ${plan.dailyRequests} free requests for today.`, {
                resets_at: nextUtcMidnight(),
              })
            : jsonError(429, "rate_limited", "You're sending messages too quickly. Please wait a moment.");
        }

        if (!conversationId) {
          const title = content.replace(/\s+/g, " ").slice(0, 60) || "New chat";
          const { data: conv, error } = await supabaseAdmin
            .from("conversations")
            .insert({ user_id: userId, title })
            .select("id")
            .single();
          if (error || !conv) return jsonError(500, "internal_error", "Could not create conversation.");
          conversationId = conv.id;
        }

        if (parsed.regenerate) {
          // Remove the trailing assistant message (if any) before regenerating
          const { data: last } = await supabaseAdmin
            .from("messages")
            .select("id, role")
            .eq("conversation_id", conversationId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (last?.role === "assistant") await supabaseAdmin.from("messages").delete().eq("id", last.id);
        } else {
          const { error } = await supabaseAdmin.from("messages").insert({
            conversation_id: conversationId,
            user_id: userId,
            role: "user",
            content,
            client_message_id: parsed.clientMessageId,
          });
          if (error) {
            if (error.code === "23505") return jsonError(409, "duplicate_request", "This message was already sent.");
            return jsonError(500, "internal_error", "Could not save your message.");
          }
        }

        const { data: history } = await supabaseAdmin
          .from("messages")
          .select("role, content, status")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: false })
          .limit(plan.maxMessages);
        const msgs = (history ?? [])
          .reverse()
          .filter((m) => m.content)
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
        // Keep total context under the input limit (drop oldest first)
        let total = 0;
        const trimmed: typeof msgs = [];
        for (let i = msgs.length - 1; i >= 0; i--) {
          const m = msgs[i]!; total += m.content.length;
          if (total > plan.maxInputChars * 4 && trimmed.length > 0) break;
          trimmed.unshift(m);
        }

        const convId = conversationId;
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: unknown) => {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
              } catch {
                /* client gone */
              }
            };
            send({ type: "meta", conversationId: convId, requestId });
            let text = "";
            let usage: { inputTokens: number | null; outputTokens: number | null } | null = null;
            let status: "success" | "error" | "cancelled" = "success";
            let errorCode: string | undefined;
            try {
              for await (const ev of streamChat([{ role: "system", content: SYSTEM_PROMPT }, ...trimmed], {
                maxOutputTokens: plan.maxOutputTokens,
                signal: request.signal,
              })) {
                if (ev.type === "delta") {
                  text += ev.text;
                  send({ type: "delta", text: ev.text });
                } else if (ev.type === "usage") usage = ev.usage;
              }
            } catch (e) {
              if (request.signal.aborted) status = "cancelled";
              else {
                status = "error";
                errorCode = e instanceof ProviderError ? e.code : "internal_error";
                send({
                  type: "error",
                  code: errorCode,
                  message: e instanceof ProviderError ? e.message : "Something went wrong while generating a response.",
                });
              }
            }
            const msgStatus = status === "success" ? "complete" : text ? "incomplete" : "error";
            if (text || status === "success") {
              await supabaseAdmin.from("messages").insert({
                conversation_id: convId,
                user_id: userId,
                role: "assistant",
                content: text,
                status: msgStatus,
                provider_usage: usage ? { ...usage, estimated: false } : null,
              });
            }
            await supabaseAdmin.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
            const inputChars = trimmed.reduce((a, m) => a + m.content.length, 0);
            await recordUsage({
              userId,
              apiKeyId: null,
              requestId,
              source: "web",
              status,
              inputTokens: usage?.inputTokens ?? Math.ceil(inputChars / 4),
              outputTokens: usage?.outputTokens ?? estimateTokens(text),
              estimated: !usage,
              errorCode,
            });
            if (status === "success") send({ type: "done" });
            try {
              controller.close();
            } catch {
              /* ignore */
            }
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Request-Id": requestId,
          },
        });
      },
    },
  },
});
