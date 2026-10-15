import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/v1/models")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const { corsHeaders } = await import("@/lib/public-api.server");
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      },
      GET: async ({ request }) => {
        const { corsHeaders, apiError } = await import("@/lib/public-api.server");
        const { authenticateApiKey, newRequestId } = await import("@/lib/server-utils.server");
        const requestId = newRequestId();
        const auth = await authenticateApiKey(request.headers.get("authorization"));
        if (!auth) return apiError(request, 401, "authentication_error", "invalid_api_key", "Invalid or missing API key.", requestId);
        return Response.json(
          { object: "list", data: [{ id: "zennai", object: "model", created: 1760486400, owned_by: "zennai" }] },
          { headers: { ...corsHeaders(request), "X-Request-Id": requestId } },
        );
      },
    },
  },
});
