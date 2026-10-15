import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader, SiteFooter } from "@/components/site/SiteHeader";
import { CodeFrame } from "@/components/chat/Markdown";
import { useApiBase } from "@/lib/api-base";

export const Route = createFileRoute("/docs")({
  head: () => ({
    meta: [
      { title: "API documentation — ZennAI" },
      { name: "description", content: "Authenticate, call /v1/chat/completions, stream responses and handle errors with the ZennAI API." },
      { property: "og:title", content: "API documentation — ZennAI" },
      { property: "og:description", content: "Integrate ZennAI into JavaScript, Python, Telegram bots and servers." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Docs,
});

function Code({ lang, code }: { lang: string; code: string }) {
  return <div className="my-4"><CodeFrame lang={lang} code={code}>{code}</CodeFrame></div>;
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mt-14 scroll-mt-20 text-xl font-semibold tracking-tight">{children}</h2>;
}

const toc = [
  ["auth", "Authentication"], ["endpoints", "Endpoints"], ["js", "JavaScript"], ["python", "Python"],
  ["streaming", "Streaming"], ["telegram", "Telegram bots"], ["errors", "Errors"], ["limits", "Rate limits"],
];

function Docs() {
  const base = useApiBase();
  const js = `const response = await fetch("${base}/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": \`Bearer \${process.env.ZENNAI_API_KEY}\`,
  },
  body: JSON.stringify({
    model: "zennai",
    messages: [{ role: "user", content: "Hello!" }],
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);`;
  const py = `import os, requests

r = requests.post(
    "${base}/v1/chat/completions",
    headers={"Authorization": f"Bearer {os.environ['ZENNAI_API_KEY']}"},
    json={"model": "zennai", "messages": [{"role": "user", "content": "Hello!"}]},
    timeout=60,
)
r.raise_for_status()
print(r.json()["choices"][0]["message"]["content"])`;
  const stream = `const res = await fetch("${base}/v1/chat/completions", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: \`Bearer \${process.env.ZENNAI_API_KEY}\` },
  body: JSON.stringify({ model: "zennai", stream: true, messages: [{ role: "user", content: "Write a haiku" }] }),
});
const reader = res.body.getReader();
const decoder = new TextDecoder();
let buf = "";
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += decoder.decode(value, { stream: true });
  const lines = buf.split("\\n");
  buf = lines.pop();
  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6);
    if (data === "[DONE]") continue;
    const chunk = JSON.parse(data);
    process.stdout.write(chunk.choices?.[0]?.delta?.content ?? "");
  }
}`;
  const tg = `# pip install python-telegram-bot requests
import os, requests
from telegram.ext import ApplicationBuilder, MessageHandler, filters

async def reply(update, context):
    r = requests.post(
        "${base}/v1/chat/completions",
        headers={"Authorization": f"Bearer {os.environ['ZENNAI_API_KEY']}"},
        json={"model": "zennai", "messages": [{"role": "user", "content": update.message.text}]},
        timeout=60,
    )
    data = r.json()
    text = data["choices"][0]["message"]["content"] if r.ok else data["error"]["message"]
    await update.message.reply_text(text)

app = ApplicationBuilder().token(os.environ["TELEGRAM_BOT_TOKEN"]).build()
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, reply))
app.run_polling()`;
  const resp = `{
  "id": "chatcmpl-…",
  "object": "chat.completion",
  "created": 1760500000,
  "model": "zennai",
  "choices": [{ "index": 0, "message": { "role": "assistant", "content": "Hi! I'm ZennAI…" }, "finish_reason": "stop" }],
  "usage": { "prompt_tokens": 24, "completion_tokens": 18, "total_tokens": 42, "estimated": false }
}`;
  const err = `{
  "error": {
    "type": "rate_limit_error",
    "code": "rate_limited",
    "message": "Too many requests per minute. Slow down and retry.",
    "request_id": "req_…"
  }
}`;
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto flex max-w-6xl gap-10 px-4 py-12">
        <aside className="sticky top-20 hidden h-fit w-44 shrink-0 lg:block">
          <ul className="space-y-1 text-sm">
            {toc.map(([id, l]) => (
              <li key={id}><a href={`#${id}`} className="text-muted-foreground hover:text-foreground">{l}</a></li>
            ))}
          </ul>
        </aside>
        <article className="min-w-0 max-w-3xl flex-1 leading-relaxed">
          <h1 className="text-3xl font-semibold tracking-tight">API documentation</h1>
          <p className="mt-3 text-muted-foreground">
            Base URL: <code className="font-mono text-foreground">{base}</code>. After you deploy, use your real production API URL in every example.
          </p>

          <H2 id="auth">Authentication</H2>
          <p className="mt-3">Create a key in the developer dashboard and send it as a bearer token. Keys start with <code className="font-mono">zenn_sk_</code>.</p>
          <Code lang="http" code={`Authorization: Bearer YOUR_ZENNAI_API_KEY`} />
          <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
            Secret keys must stay on a trusted server. Never embed them in public website code or mobile apps. Anyone with the key can use your quota.
            Browser cross-origin access (CORS) is only allowed for configured origins, and CORS is not authentication.
          </p>

          <H2 id="endpoints">Endpoints</H2>
          <h3 className="mt-6 font-mono text-sm font-medium">GET /v1/models</h3>
          <p className="mt-2 text-sm text-muted-foreground">Lists available models. Currently only <code className="font-mono">zennai</code>.</p>
          <h3 className="mt-6 font-mono text-sm font-medium">POST /v1/chat/completions</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground"><tr><th className="py-2 pr-4 font-medium">Field</th><th className="py-2 font-medium">Description</th></tr></thead>
              <tbody className="[&_td]:border-t [&_td]:py-2 [&_td]:pr-4 [&_td]:align-top">
                <tr><td className="font-mono">model</td><td>Required. Must be <code>"zennai"</code>.</td></tr>
                <tr><td className="font-mono">messages</td><td>Required. Array of <code>{"{ role, content }"}</code>, where role is system, user or assistant and content is a string.</td></tr>
                <tr><td className="font-mono">stream</td><td>Optional boolean. Streams Server-Sent Events when true.</td></tr>
                <tr><td className="font-mono">max_tokens</td><td>Optional. Capped by the plan's output limit.</td></tr>
                <tr><td className="font-mono">user</td><td>Optional end-user identifier (string, up to 128 characters).</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">Any other field (for example temperature, tools or n) is rejected with HTTP 400. ZennAI doesn't silently ignore parameters.</p>
          <Code lang="json" code={`{\n  "model": "zennai",\n  "messages": [{ "role": "user", "content": "Hello, who are you?" }],\n  "stream": false\n}`} />
          <p className="text-sm text-muted-foreground">Response:</p>
          <Code lang="json" code={resp} />
          <p className="text-sm text-muted-foreground">When the provider doesn't report token usage, counts are estimated and marked <code>"estimated": true</code>.</p>

          <H2 id="js">JavaScript (Node.js / server)</H2>
          <Code lang="javascript" code={js} />
          <H2 id="python">Python</H2>
          <Code lang="python" code={py} />
          <H2 id="streaming">Streaming</H2>
          <p className="mt-3">Set <code>"stream": true</code>. Each event is a <code>chat.completion.chunk</code>. The stream ends with <code>data: [DONE]</code>. Errors that happen mid-stream arrive as a <code>{"{ error }"}</code> event.</p>
          <Code lang="javascript" code={stream} />
          <H2 id="telegram">Telegram bots & other servers</H2>
          <p className="mt-3">Any backend that can make HTTPS requests can call ZennAI. Keep the key in an environment variable. Here's a minimal Telegram bot:</p>
          <Code lang="python" code={tg} />
          <p className="text-sm text-muted-foreground">For websites, call ZennAI from your own backend (or serverless function) and forward the result to the browser.</p>

          <H2 id="errors">Errors</H2>
          <Code lang="json" code={err} />
          <ul className="mt-3 space-y-2 text-sm">
            <li><b>400</b>: invalid JSON, unsupported fields, wrong model, or input too long.</li>
            <li><b>401</b>: missing, invalid or revoked API key.</li>
            <li><b>413</b>: request body too large.</li>
            <li><b>429</b>: per-minute rate limit (<code>rate_limited</code>, includes Retry-After) or daily quota exhausted (<code>daily_quota_exceeded</code>).</li>
            <li><b>500</b>: unexpected server error.</li>
            <li><b>502 / 503 / 504</b>: the upstream AI provider failed, isn't configured, or timed out.</li>
          </ul>
          <p className="mt-3 text-sm text-muted-foreground">Every response includes an <code>X-Request-Id</code> header. Include it when reporting issues.</p>

          <H2 id="limits">Rate limits</H2>
          <p className="mt-3">The free plan allows 20 requests per day per account by default, shared between website chat and the API. Requests are also limited per minute, per account and per key. Quotas reset at 00:00 UTC. Your current numbers are in the dashboard.</p>
        </article>
      </div>
      <SiteFooter />
    </div>
  );
}
