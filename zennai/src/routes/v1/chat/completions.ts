import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v1/chat/completions")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { corsHeaders } = await import("@/lib/public-api.server");
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      },
      POST: async ({ request }) => {
        const { corsHeaders, apiError, ChatCompletionBody } = await import("@/lib/public-api.server");
        const { authenticateApiKey, newRequestId, consumeQuota, recordUsage, nextUtcMidnight } = await import(
          "@/lib/server-utils.server"
        );
        const { getPlanConfig } = await import("@/lib/config.server");
        const { streamChat, ProviderError, estimateTokens, isProviderConfigured, SYSTEM_PROMPT } = await import(
          "@/lib/ai/provider.server"
        );
        const plan = getPlanConfig();
        const requestId = newRequestId();
        const err = (s: number, t: string, c: string, m: string, h?: Record<string, string>) =>
          apiError(request, s, t, c, m, requestId, h);

        const auth = await authenticateApiKey(request.headers.get("authorization"));
        if (!auth) return err(401, "authentication_error", "invalid_api_key", "Invalid or missing API key.");

        if (!(request.headers.get("content-type") || "").includes("application/json"))
          return err(400, "invalid_request_error", "invalid_content_type", "Content-Type must be application/json.");
        const raw = await request.text();
        if (raw.length > plan.maxBodyBytes)
          return err(413, "invalid_request_error", "payload_too_large", `Request body exceeds ${plan.maxBodyBytes} bytes.`);
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          return err(400, "invalid_request_error", "invalid_json", "Request body is not valid JSON.");
        }
        const parsed = ChatCompletionBody.safeParse(json);
        if (!parsed.success) {
          const issue = parsed.error.issues[0]!;
          const path = issue.path.join(".");
          return err(400, "invalid_request_error", "invalid_parameter", `${path ? path + ": " : ""}${issue.message}`);
        }
        const body = parsed.data;
        if (body.messages.length > plan.maxMessages)
          return err(400, "invalid_request_error", "too_many_messages", `At most ${plan.maxMessages} messages are allowed.`);
        const inputChars = body.messages.reduce((a, m) => a + m.content.length, 0);
        if (inputChars > plan.maxInputChars)
          return err(400, "invalid_request_error", "input_too_long", `Total message content exceeds ${plan.maxInputChars} characters.`);
        if (body.max_tokens && body.max_tokens > plan.maxOutputTokens)
          return err(400, "invalid_request_error", "invalid_parameter", `max_tokens cannot exceed ${plan.maxOutputTokens}.`);
        if (!isProviderConfigured())
          return err(503, "server_error", "not_configured", "The AI provider is not configured on this server.");

        const quota = await consumeQuota(auth.userId, auth.apiKeyId);
        if (!quota.ok) {
          await recordUsage({ userId: auth.userId, apiKeyId: auth.apiKeyId, requestId, source: "api", status: "rejected", errorCode: quota.reason });
          return quota.reason === "quota_exceeded"
            ? err(429, "quota_exceeded", "daily_quota_exceeded", `Daily limit of ${plan.dailyRequests} requests reached. Resets at ${nextUtcMidnight()}.`)
            : err(429, "rate_limit_error", "rate_limited", "Too many requests per minute. Slow down and retry.", { "Retry-After": "60" });
        }

        const messages = body.messages.some((m) => m.role === "system")
          ? body.messages
          : [{ role: "system" as const, content: SYSTEM_PROMPT }, ...body.messages];
        const maxOutputTokens = body.max_tokens ?? plan.maxOutputTokens;
        const created = Math.floor(Date.now() / 1000);
        const id = "chatcmpl-" + requestId.slice(4);
        const finishUsage = async (
          status: "success" | "error" | "cancelled",
          text: string,
          usage: { inputTokens: number | null; outputTokens: number | null } | null,
          errorCode?: string,
        ) =>
          recordUsage({
            userId: auth.userId,
            apiKeyId: auth.apiKeyId,
            requestId,
            source: "api",
            status,
            inputTokens: usage?.inputTokens ?? Math.ceil(inputChars / 4),
            outputTokens: usage?.outputTokens ?? estimateTokens(text),
            estimated: !usage,
            errorCode,
          });

        if (!body.stream) {
          let text = "";
          let usage: { inputTokens: number | null; outputTokens: number | null } | null = null;
          let finish: string | null = "stop";
          try {
            for await (const ev of streamChat(messages, { maxOutputTokens, signal: request.signal })) {
              if (ev.type === "delta") text += ev.text;
              else if (ev.type === "usage") usage = ev.usage;
              else if (ev.type === "finish") finish = ev.reason;
            }
          } catch (e) {
            const code = e instanceof ProviderError ? e.code : "internal_error";
            await finishUsage(request.signal.aborted ? "cancelled" : "error", text, usage, code);
            if (e instanceof ProviderError) return err(e.status, "server_error", e.code, e.message);
            return err(500, "server_error", "internal_error", "Internal server error.");
          }
          await finishUsage("success", text, usage);
          const pt = usage?.inputTokens ?? Math.ceil(inputChars / 4);
          const ct = usage?.outputTokens ?? estimateTokens(text);
          return Response.json(
            {
              id,
              object: "chat.completion",
              created,
              model: "zennai",
              choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: finish }],
              usage: { prompt_tokens: pt, completion_tokens: ct, total_tokens: pt + ct, estimated: !usage },
            },
            { headers: { ...corsHeaders(request), "X-Request-Id": requestId } },
          );
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: unknown) => {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
              } catch {
                /* closed */
              }
            };
            const chunk = (delta: Record<string, string>, finish_reason: string | null = null) => ({
              id,
              object: "chat.completion.chunk",
              created,
              model: "zennai",
              choices: [{ index: 0, delta, finish_reason }],
            });
            let text = "";
            let usage: { inputTokens: number | null; outputTokens: number | null } | null = null;
            let finish: string | null = "stop";
            send(chunk({ role: "assistant" }));
            try {
              for await (const ev of streamChat(messages, { maxOutputTokens, signal: request.signal })) {
                if (ev.type === "delta") {
                  text += ev.text;
                  send(chunk({ content: ev.text }));
                } else if (ev.type === "usage") usage = ev.usage;
                else if (ev.type === "finish") finish = ev.reason;
              }
              send(chunk({}, finish));
              send({ ...chunk({}), choices: [], usage: { prompt_tokens: usage?.inputTokens ?? null, completion_tokens: usage?.outputTokens ?? null } });
              await finishUsage("success", text, usage);
            } catch (e) {
              const code = e instanceof ProviderError ? e.code : "internal_error";
              send({ error: { type: "server_error", code, message: e instanceof ProviderError ? e.message : "Internal server error.", request_id: requestId } });
              await finishUsage(request.signal.aborted ? "cancelled" : "error", text, usage, code);
            }
            try {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            } catch {
              /* ignore */
            }
          },
        });
        return new Response(stream, {
          headers: {
            ...corsHeaders(request),
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "X-Request-Id": requestId,
          },
        });
      },
    },
  },
});
