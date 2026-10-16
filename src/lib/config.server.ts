// Server-only configuration. All values come from environment variables / secrets
// and are read per call (Cloudflare Workers inject env per request).

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const MODEL_ALIAS = "zennai";

export function getPlanConfig() {
  return {
    dailyRequests: int("FREE_DAILY_REQUESTS", 200),
    userPerMinute: int("FREE_USER_PER_MINUTE", 6),
    keyPerMinute: int("FREE_KEY_PER_MINUTE", 6),
    maxInputChars: int("MAX_INPUT_CHARS", 16000),
    maxMessages: int("MAX_MESSAGES", 50),
    maxOutputTokens: int("MAX_OUTPUT_TOKENS", 1024),
    maxBodyBytes: int("MAX_BODY_BYTES", 200_000),
    keyCreatePerHour: int("KEY_CREATE_PER_HOUR", 5),
    maxActiveKeys: int("MAX_ACTIVE_KEYS", 10),
  };
}

export function getProviderConfig() {
  const apiKey = process.env["AI_API_KEY"];
  const baseUrl = (process.env["AI_BASE_URL"] || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
  const model = process.env["AI_MODEL"] || "cognitivecomputations/dolphin-mistral-24b-venice-edition";
  // OpenAI's newest models require max_completion_tokens; most compatible APIs accept max_tokens.
  const maxTokensField = process.env["AI_MAX_TOKENS_FIELD"] === "max_tokens" ? "max_tokens" : "max_completion_tokens";
  const timeoutMs = int("AI_TIMEOUT_MS", 30000);
  return { apiKey, baseUrl, model, maxTokensField, timeoutMs } as const;
}

export function getAllowedOrigins(): string[] {
  return (process.env["ALLOWED_ORIGINS"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
