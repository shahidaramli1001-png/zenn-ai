
import { getProviderConfig } from "@/lib/config.server";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ProviderUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
};

export class ProviderError extends Error {
  constructor(
    public code:
      | "not_configured"
      | "provider_auth"
      | "provider_rate_limited"
      | "provider_bad_request"
      | "provider_timeout"
      | "provider_unavailable",
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export const SYSTEM_PROMPT = `
You are ZennAI, a helpful, precise, friendly, and reliable AI assistant.

LANGUAGE AND STYLE
- Reply in the same language as the user's latest message.
- Use clear Markdown and correctly labelled code blocks.
- Give useful, direct answers.
- Do not force status cards into ordinary conversations.

STATUS CARDS
For coding, troubleshooting, research, planning, and multi-step tasks,
use short Markdown list items as progress cards when useful.
Each status must start at the beginning of its own list item.

Supported status tags:
[ANALYZING]
[PLANNING]
[SEARCHING]
[READING]
[WRITING]
[CODING]
[DATABASE]
[CONNECTING]
[FIXING]
[GENERATING]
[REVIEWING]
[TESTING]
[EXECUTING]
[VERIFYING]
[DEPLOYING]
[SUMMARIZING]
[WAITING]
[IN_PROGRESS]
[PENDING]
[DONE]
[COMPLETED]
[ERROR]

Example:
- [ANALYZING] Memahami masalah yang dilaporkan.
- [PLANNING] Menentukan langkah penyelesaian.
- [CODING] Mengemas kini kod berkaitan.
- [TESTING] Menyemak perubahan.
- [DONE] Perubahan telah disahkan.

STATUS RULES
- Use the user's language for status descriptions.
- Keep descriptions short and informative.
- Use only statuses relevant to the current task.
- Do not generate fake progress updates.
- Do not claim to be performing an action unless it is actually happening.
- Never claim to have searched, edited files, queried a database,
  run tests, or deployed code unless that action really occurred.
- Use [DONE] or [COMPLETED] only for confirmed successful results.
- Use [ERROR] only for confirmed failures.
- Use [PENDING] for work not started or awaiting verification.
- Use [IN_PROGRESS] for work genuinely underway.
- Use [TESTING] only when testing is actually taking place.
- If a result cannot be verified, say so clearly.
- Never reveal private chain-of-thought or hidden reasoning.
- Status cards are short user-facing summaries, not internal reasoning.
- Do not mark an action complete merely because you described it.

GENERAL BEHAVIOUR
- Explain errors and offer practical next steps.
- Distinguish verified facts from assumptions.
- Never invent test results, links, API responses, or completed actions.
- Provide complete relevant code when requested.
- Preserve the existing project architecture.
`.trim();

export function isProviderConfigured() {
  return !!getProviderConfig().apiKey;
}

async function openStream(
  messages: ChatMessage[],
  maxOutputTokens: number,
  signal?: AbortSignal,
) {
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

  const timer = setTimeout(
    () => controller.abort(new Error("timeout")),
    cfg.timeoutMs,
  );

  let res: Response;

  try {
    res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: true,
        stream_options: {
          include_usage: true,
        },
        [cfg.maxTokensField]: maxOutputTokens,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);

    if (signal?.aborted) {
      throw error;
    }

    if (controller.signal.aborted) {
      throw new ProviderError(
        "provider_timeout",
        "The AI provider did not respond in time.",
        504,
      );
    }

    throw new ProviderError(
      "provider_unavailable",
      "Could not reach the AI provider.",
      502,
    );
  }

  clearTimeout(timer);

  if (!res.ok) {
    let detail = "";

    try {
      const json = (await res.json()) as {
        error?: {
          message?: string;
        };
      };

      detail = json?.error?.message ?? "";
    } catch {
      // Ignore non-JSON error responses.
    }

    console.error(
      "[ai] provider error",
      res.status,
      detail.slice(0, 300),
    );

    signal?.removeEventListener("abort", onAbort);

    if (res.status === 401 || res.status === 403) {
      throw new ProviderError(
        "provider_auth",
        "The AI provider rejected the server credentials. Check AI_API_KEY.",
        502,
      );
    }

    if (res.status === 429) {
      throw new ProviderError(
        "provider_rate_limited",
        "The AI provider is rate limiting requests. Try again shortly.",
        503,
      );
    }

    if (
      res.status === 400 ||
      res.status === 404 ||
      res.status === 422
    ) {
      throw new ProviderError(
        "provider_bad_request",
        "The AI provider rejected the request. Check AI_MODEL and settings.",
        502,
      );
    }

    throw new ProviderError(
      "provider_unavailable",
      "The AI provider is temporarily unavailable.",
      502,
    );
  }

  return {
    res,
    cleanup: () => {
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

export async function* streamChat(
  messages: ChatMessage[],
  opts: {
    maxOutputTokens: number;
    signal?: AbortSignal;
  },
): AsyncGenerator<
  | { type: "delta"; text: string }
  | { type: "usage"; usage: ProviderUsage }
  | { type: "finish"; reason: string | null }
> {
  const { res, cleanup } = await openStream(
    messages,
    opts.maxOutputTokens,
    opts.signal,
  );

  if (!res.body) {
    cleanup();

    throw new ProviderError(
      "provider_unavailable",
      "The AI provider returned an empty response stream.",
      502,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;

      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (!line.startsWith("data:")) continue;

        const data = line.slice(5).trim();

        if (data === "[DONE]") return;

        try {
          const json = JSON.parse(data) as {
            choices?: {
              delta?: {
                content?: string;
              };
              finish_reason?: string | null;
            }[];
            usage?: {
              prompt_tokens?: number;
              completion_tokens?: number;
            } | null;
          };

          const choice = json.choices?.[0];
          const content = choice?.delta?.content;

          if (content) {
            yield {
              type: "delta",
              text: content,
            };
          }

          if (choice?.finish_reason) {
            yield {
              type: "finish",
              reason: choice.finish_reason,
            };
          }

          if (json.usage) {
            yield {
              type: "usage",
              usage: {
                inputTokens: json.usage.prompt_tokens ?? null,
                outputTokens: json.usage.completion_tokens ?? null,
              },
            };
          }
        } catch {
          // Ignore incomplete or invalid SSE messages.
        }
      }
    }
  } finally {
    cleanup();

    try {
      reader.releaseLock();
    } catch {
      // Ignore reader cleanup errors.
    }
  }
}

export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}
