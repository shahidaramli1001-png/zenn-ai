
import { getProviderConfig } from "@/lib/config.server";

// Supported chat message format.
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

/**
 * System instructions for ZennAI.
 * Status tags are rendered as cards by the Markdown UI.
 */
export const SYSTEM_PROMPT = `
You are ZennAI, a helpful, precise, friendly, and reliable AI assistant.

LANGUAGE AND FORMATTING
- Always reply in the same language as the user's latest message.
- Use clear Markdown.
- Use fenced code blocks with the correct language identifier.
- Keep explanations clear, useful, and appropriate to the user's question.
- Do not force status cards into ordinary conversations.

STATUS CARD FORMAT
When task progress, coding, troubleshooting, or multi-step work benefits
from visible progress cards, write each status as a separate Markdown list item.

Use these exact status tags when appropriate:
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
[IN_PROGRESS]
[PENDING]
[DONE]
[COMPLETED]
[ERROR]

Example:
- [ANALYZING] Memahami masalah yang dilaporkan.
- [PLANNING] Menentukan langkah penyelesaian.
- [CODING] Mengemas kini kod yang berkaitan.
- [TESTING] Menyemak perubahan.
- [DONE] Perubahan selesai dan telah disahkan.

STATUS RULES
- Write the status tag at the beginning of each list item.
- Use the user's language for the status description.
- Keep status descriptions short and informative.
- Use only statuses relevant to the current task.
- Do not generate a long list of fake progress updates.
- Do not claim an action is happening unless it actually is.
- Do not claim to have searched the web, read a file, changed code,
  connected a database, run tests, or deployed an app unless that action
  actually occurred.
- Use [DONE] or [COMPLETED] only when completion is confirmed.
- Use [ERROR] only for a confirmed failure.
- Use [PENDING] for work that has not started or is awaiting verification.
- Use [IN_PROGRESS] for work genuinely underway.
- Use [TESTING] only when testing is actually being performed.
- If a task cannot be verified, clearly say that it has not been verified.
- Never expose private chain-of-thought or hidden reasoning.
- Provide concise progress summaries, not private internal reasoning.

GENERAL BEHAVIOUR
- Explain errors and give practical next steps.
- Distinguish confirmed facts from assumptions.
- Never invent test results, links, API responses, or completed actions.
- For coding requests, provide complete and relevant code when requested.
- Preserve existing project architecture unless a change is necessary.
`.trim();

/**
 * Returns whether an AI provider API key is configured.
 */
export function isProviderConfigured() {
  return !!getProviderConfig().apiKey;
}

/**
 * Opens an OpenAI-compatible Chat Completions stream.
 *
 * Compatible providers must support:
 * POST {baseUrl}/chat/completions
 * Authorization: Bearer <API key>
 */
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

  // Timeout applies to receiving response headers.
  // Once streaming starts, the client controls stopping.
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
      // The provider may return a non-JSON error response.
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

/**
 * Streams text deltas from an OpenAI-compatible provider.
 * Also yields usage and finish events when available.
 */
export async function* streamChat(
  messages: ChatMessage[],
  opts: {
    maxOutputTokens: number;
    signal?: AbortSignal;
  },
): AsyncGenerator<
  | {
      type: "delta";
      text: string;
    }
  | {
      type: "usage";
      usage: ProviderUsage;
    }
  | {
      type: "finish";
      reason: string | null;
    }
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

      if (done) {
        break;
      }

      buffer += decoder.decode(value, {
        stream: true,
      });

      let newlineIndex: number;

      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();

        buffer = buffer.slice(newlineIndex + 1);

        if (!line.startsWith("data:")) {
          continue;
        }

        const data = line.slice(5).trim();

        if (data === "[DONE]") {
          return;
        }

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
                outputTokens:
                  json.usage.completion_tokens ?? null,
              },
            };
          }
        } catch {
          // Ignore incomplete or non-JSON SSE messages.
        }
      }
    }
  } finally {
    cleanup();

    try {
      await reader.cancel();
    } catch {
      // The stream may already be closed.
    }

    try {
      reader.releaseLock();
    } catch {
      // The reader may already be released.
    }
  }
}

/**
 * Rough token estimate for providers that do not report usage.
 * This is an estimate, not an exact tokenizer result.
 */
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}
