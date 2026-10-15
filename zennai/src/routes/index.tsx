import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquare, Code2, Plug, Gauge, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteHeader, SiteFooter } from "@/components/site/SiteHeader";
import { CodeFrame } from "@/components/chat/Markdown";
import { useApiBase } from "@/lib/api-base";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ZennAI — Intelligence, Simplified." },
      { name: "description", content: "Chat with AI, build with the ZennAI API, and bring intelligent experiences to your applications." },
      { property: "og:title", content: "ZennAI — Intelligence, Simplified." },
      { property: "og:description", content: "Chat with AI, build with our API, and bring intelligent experiences to your applications." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: MessageSquare, title: "AI chat", text: "A focused, fast chat experience with streaming answers, Markdown, code highlighting and saved history." },
  { icon: Code2, title: "Developer API", text: "An OpenAI-style /v1/chat/completions endpoint with streaming, authenticated by your own API keys." },
  { icon: Plug, title: "Easy integration", text: "Call ZennAI from a Telegram bot, a backend service, or any server that can make HTTPS requests." },
  { icon: Gauge, title: "Usage & accounts", text: "Clear daily limits, per-minute throttling, key management and a usage history in your dashboard." },
];

function Landing() {
  const base = useApiBase();
  const curl = `curl ${base}/v1/chat/completions \\
  -H "Authorization: Bearer $ZENNAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "zennai",
    "messages": [{ "role": "user", "content": "Hello, who are you?" }]
  }'`;
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-3xl px-4 pb-20 pt-24 text-center sm:pt-32">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">Intelligence, Simplified.</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Chat with AI, build with our API, and bring intelligent experiences to your applications.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link to="/chat">
                Start chatting <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#api">Explore the API</a>
            </Button>
          </div>
        </section>

        <section id="features" className="border-t">
          <div className="mx-auto grid max-w-6xl gap-px px-4 py-16 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title} className="p-5">
                <f.icon className="h-5 w-5 text-brand" />
                <h2 className="mt-4 font-medium">{f.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="api" className="border-t bg-sidebar">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold tracking-tight">One API, wherever you build.</h2>
              <p className="mt-4 text-muted-foreground">
                Create a key in the developer dashboard and send standard chat messages. Responses follow the familiar
                Chat Completions format, so existing client code adapts easily.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                <li>• JSON or streaming (Server-Sent Events) responses</li>
                <li>• Free tier with a daily request limit</li>
                <li>• Keys are hashed at rest and revocable anytime</li>
              </ul>
              <Button asChild variant="outline" className="mt-8">
                <Link to="/docs">Read the documentation</Link>
              </Button>
            </div>
            <div className="min-w-0">
              <CodeFrame lang="bash" code={curl}>
                {curl}
              </CodeFrame>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
