// Reusable server-side AI adapter for OpenAI-compatible Chat Completions APIs
// (OpenAI, or any provider exposing the same /chat/completions contract).
import { getProviderConfig } from "@/lib/config.server";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ProviderUsage = { inputTokens: number | null; outputTokens: number | null };

export class ProviderError extends Error {
  constructor(
    public code: "not_configured" | "provider_auth" | "provider_rate_limited" | "provider_bad_request" | "provider_timeout" | "provider_unavailable",
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export const SYSTEM_PROMPT =
  "You are ZennAI, a helpful, precise and friendly AI assistant. Answer clearly and concisely. Use Markdown for structure and fenced code blocks with a language tag for code.";

export function isProviderConfigured() {
  return !!getProviderConfig().apiKey;
}

async function openStream(messages: ChatMessage[], maxOutputTokens: number, signal?: AbortSignal) {
  const cfg = getProviderConfig();
  if (!cfg.apiKey) {
    throw new ProviderError(
      "not_configured",
      "The AI provider is not configured. Set the AI_API_KEY secret (and optionally AI_BASE_URL and AI_MODEL).",
      503,
    );
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  // Timeout applies to receiving response headers only; once streaming, the client controls stopping.
  const timer = setTimeout(() => controller.abort(new Error("timeout")), cfg.timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        [cfg.maxTokensField]: maxOutputTokens,
      }),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    if (signal?.aborted) throw e;
    if (controller.signal.aborted) throw new ProviderError("provider_timeout", "The AI provider did not respond in time.", 504);
    throw new ProviderError("provider_unavailable", "Could not reach the AI provider.", 502);
  }
  clearTimeout(timer);
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { error?: { message?: string } };
      detail = j?.error?.message ?? "";
    } catch {
      /* ignore */
    }
    console.error("[ai] provider error", res.status, detail.slice(0, 300));
    if (res.status === 401 || res.status === 403)
      throw new ProviderError("provider_auth", "The AI provider rejected the server credentials. Check AI_API_KEY.", 502);
    if (res.status === 429)
      throw new ProviderError("provider_rate_limited", "The AI provider is rate limiting requests. Try again shortly.", 503);
    if (res.status === 400 || res.status === 404 || res.status === 422)
      throw new ProviderError("provider_bad_request", "The AI provider rejected the request. Check AI_MODEL and settings.", 502);
    throw new ProviderError("provider_unavailable", "The AI provider is temporarily unavailable.", 502);
  }
  return { res, cleanup: () => signal?.removeEventListener("abort", onAbort) };
}

/** Streams text deltas. Resolves usage when the provider reports it. */
export async function* streamChat(
  messages: ChatMessage[],
  opts: { maxOutputTokens: number; signal?: AbortSignal },
): AsyncGenerator<{ type: "delta"; text: string } | { type: "usage"; usage: ProviderUsage } | { type: "finish"; reason: string | null }> {
  const { res, cleanup } = await openStream(messages, opts.maxOutputTokens, opts.signal);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const j = JSON.parse(data) as {
            choices?: { delta?: { content?: string }; finish_reason?: string | null }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number } | null;
          };
          const choice = j.choices?.[0];
          const text = choice?.delta?.content;
          if (text) yield { type: "delta", text };
          if (choice?.finish_reason) yield { type: "finish", reason: choice.finish_reason };
          if (j.usage)
            yield {
              type: "usage",
              usage: { inputTokens: j.usage.prompt_tokens ?? null, outputTokens: j.usage.completion_tokens ?? null },
            };
        } catch {
          /* partial or non-JSON line */
        }
      }
    }
  } finally {
    cleanup();
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

/** Rough estimate used only when the provider does not report usage (~4 chars/token). */
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}
