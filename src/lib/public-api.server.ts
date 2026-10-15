// Public developer API (OpenAI Chat Completions-style) shared helpers.
import { z } from "zod";
import { getAllowedOrigins } from "@/lib/config.server";

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  const allowed = getAllowedOrigins();
  const h: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Expose-Headers": "X-Request-Id",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (origin && allowed.includes(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

export function apiError(
  request: Request,
  status: number,
  type: string,
  code: string,
  message: string,
  requestId: string,
  extraHeaders: Record<string, string> = {},
) {
  return Response.json(
    { error: { type, code, message, request_id: requestId } },
    { status, headers: { ...corsHeaders(request), "X-Request-Id": requestId, ...extraHeaders } },
  );
}

export const SUPPORTED_FIELDS = ["model", "messages", "stream", "max_tokens", "user"] as const;

export const ChatCompletionBody = z
  .object({
    model: z.literal("zennai", { message: 'model must be "zennai"' }),
    messages: z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string(),
        }).strict(),
      )
      .min(1, "messages must contain at least one message"),
    stream: z.boolean().optional(),
    max_tokens: z.number().int().positive().optional(),
    user: z.string().max(128).optional(),
  })
  .strict();
