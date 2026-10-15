# ZennAI — Intelligence, Simplified.

AI chat website plus a public, OpenAI-style developer API. It's one TanStack Start app that deploys to **Cloudflare Workers**, serving both the pages and the API.

## Architecture
- `src/routes/*`: pages (landing, auth, chat, developer dashboard, docs, settings)
- `src/routes/api/chat.ts`: website chat streaming endpoint (SSE, user session auth)
- `src/routes/v1/models.ts`, `src/routes/v1/chat/completions.ts`: public API (API key auth)
- `src/lib/ai/provider.server.ts`: AI adapter for OpenAI-compatible `/chat/completions`
- `src/lib/server-utils.server.ts`: key hashing (SHA-256), API key auth, quota, usage logging
- `src/lib/account.functions.ts`: create and revoke keys, plan info, account deletion
- `supabase/migrations` / `drizzle/migrations`: schema, RLS, the atomic `consume_quota` function

## Environment variables (server secrets)
| Name | Required | Default |
|---|---|---|
| `AI_API_KEY` | yes | — |
| `AI_BASE_URL` | no | `https://api.openai.com/v1` |
| `AI_MODEL` | no | `gpt-4o-mini` |
| `AI_MAX_TOKENS_FIELD` | no | `max_completion_tokens` (set `max_tokens` for older compatible APIs) |
| `AI_TIMEOUT_MS` | no | 30000 |
| `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | yes | — |
| `ALLOWED_ORIGINS` | no | comma-separated origins allowed for browser CORS on `/v1/*` |
| `FREE_DAILY_REQUESTS` | no | 20 |
| `FREE_USER_PER_MINUTE` / `FREE_KEY_PER_MINUTE` | no | 6 |
| `MAX_INPUT_CHARS` / `MAX_OUTPUT_TOKENS` / `MAX_MESSAGES` / `MAX_BODY_BYTES` | no | 16000 / 1024 / 50 / 200000 |
| `KEY_CREATE_PER_HOUR` / `MAX_ACTIVE_KEYS` | no | 5 / 10 |

Browser (public): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and optionally `VITE_PUBLIC_API_URL` (shown in docs). Never give a secret a `VITE_` prefix.

## Self-hosting outside Lovable
1. **Accounts**: Cloudflare (free plan is fine), Supabase (free tier), and an AI provider account (usage is billed by the provider).
2. **Supabase**: create a project and run the SQL migrations in order. Under Auth, enable email/password and set Site URL plus redirect URLs (`https://your-domain/chat`, `https://your-domain/reset-password`).
3. **Local dev**: `bun install`, put the variables in `.dev.vars` / `.env`, then `bun run dev`.
4. **Deploy**: `bun run build`, set secrets with `npx wrangler secret put AI_API_KEY` (and the others), then `npx wrangler deploy`. Connect GitHub in the Cloudflare dashboard (Workers → Create → Import repository) for automatic deploys.
5. **Custom domains**: attach e.g. `zennai.example.com` to the Worker. To give the API its own host (e.g. `api.example.com`), add a second custom domain or route on the same Worker. `/v1/*` works on any hostname. Set `VITE_PUBLIC_API_URL` and `ALLOWED_ORIGINS`.

## Smoke tests
```bash
curl -s $BASE/v1/models -H "Authorization: Bearer $ZENNAI_API_KEY"
curl -s $BASE/v1/chat/completions -H "Authorization: Bearer $ZENNAI_API_KEY" \
  -H "Content-Type: application/json" -d '{"model":"zennai","messages":[{"role":"user","content":"Hi"}]}'
curl -s -o /dev/null -w "%{http_code}\n" $BASE/v1/models -H "Authorization: Bearer zenn_sk_bad"   # 401
```

## Security notes
- API keys: 190-bit random, `zenn_sk_` prefix, stored only as SHA-256 hashes. Revocation keeps usage history.
- RLS: users can read only their own rows. All writes to messages, keys and usage go through server code.
- Quotas: one atomic Postgres function, safe under concurrent requests.
- Model HTML is never rendered: Markdown runs with `skipHtml` and no raw-HTML plugin.
