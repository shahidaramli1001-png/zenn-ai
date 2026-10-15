# Deploy ZennAI to Cloudflare (simple guide)

ZennAI is ONE app (website + API) that runs as a Cloudflare Worker.

## 0. Important: you need your own database project
The app's server code needs a database "service role" key. The built-in
Lovable Cloud database does not give you that key, so for Cloudflare you must
create your own free Supabase project (supabase.com) and:
1. Run every file in `drizzle/migrations/` (0000 then 0001) (SQL editor, in filename order).
2. Auth -> URL configuration: set Site URL to your Cloudflare site URL.
3. Copy: Project URL, publishable (anon) key, service role key.

(If you do not want this, use Lovable's Publish button instead - no setup.)

## 1. Install tools (once)
- Node.js 20+ and bun (https://bun.sh)
- A free Cloudflare account (https://dash.cloudflare.com)

## 2. Prepare
```
bun install
```
Edit `.env` so VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (and
SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY) point to YOUR Supabase project.

## 3. Build
```
bun run build
```
This creates the `.output/` folder (Worker + static files).

## 4. Deploy
```
npx wrangler login
cd .output
npx wrangler deploy
```
(If `.output/server/wrangler.json` exists, run `npx wrangler deploy` with
`--config .output/server/wrangler.json` from the project root.)

## 5. Add secrets (Cloudflare dashboard -> Workers -> your worker -> Settings -> Variables, or `npx wrangler secret put NAME`)
| Name | Value |
|------|-------|
| AI_API_KEY | your Google AI Studio key |
| AI_BASE_URL | https://generativelanguage.googleapis.com/v1beta/openai |
| AI_MODEL | gemini-flash-latest |
| AI_MAX_TOKENS_FIELD | max_tokens |
| SUPABASE_URL | your Supabase project URL |
| SUPABASE_PUBLISHABLE_KEY | your publishable key |
| SUPABASE_SERVICE_ROLE_KEY | your service role key (secret!) |
| ALLOWED_ORIGINS | your site URL(s), comma separated (for browser API use) |

## 6. Test
Open your `*.workers.dev` URL, sign up, confirm email, send a chat message,
create an API key, and call `/v1/chat/completions` with it.

Never put AI_API_KEY or the service role key in the browser or in Git.
