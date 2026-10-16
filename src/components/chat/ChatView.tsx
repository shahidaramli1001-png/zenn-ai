import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Square, RotateCcw, AlertCircle, Lightbulb, Code2, FileText, Sparkle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Markdown, CopyButton } from "./Markdown";
import { LogoMark } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "incomplete" | "error" | "streaming";
  error?: string;
  created_at?: string;
};

const MAX_CHARS = 16000;
const HISTORY_PAGE = 50;
const SUGGESTIONS = [
  { icon: Lightbulb, label: "Explain a difficult concept", prompt: "Explain a difficult concept to me simply: how does public-key cryptography work?" },
  { icon: Code2, label: "Help me write code", prompt: "Help me write a TypeScript function that debounces another function, with a short explanation." },
  { icon: FileText, label: "Summarize a document", prompt: "I'll paste a document next. Summarize it in five concise bullet points and list any action items." },
  { icon: Sparkle, label: "Brainstorm new ideas", prompt: "Brainstorm 8 creative side-project ideas for a developer who enjoys AI and design." },
];

async function authHeader() {
  const { data } = await supabase.auth.getSession();
  return data.session ? `Bearer ${data.session.access_token}` : "";
}

export function ChatView({ routeConversationId }: { routeConversationId?: string | undefined }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [convId, setConvId] = useState<string | undefined>(routeConversationId);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const loadMessages = useCallback(async (id: string, before?: string) => {
    let q = supabase
      .from("messages")
      .select("id, role, content, status, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_PAGE);
    if (before) q = q.lt("created_at", before);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).reverse() as Msg[];
  }, []);

  // React to route changes (but not to our own navigation after creating a chat)
  useEffect(() => {
    if (routeConversationId === convId && (messages.length > 0 || !routeConversationId)) return;
    abortRef.current?.abort();
    setConvId(routeConversationId);
    setBanner(null);
    setMessages([]);
    if (!routeConversationId) {
      setHasOlder(false);
      return;
    }
    setLoading(true);
    loadMessages(routeConversationId)
      .then((m) => {
        setMessages(m);
        setHasOlder(m.length === HISTORY_PAGE);
        stick.current = true;
      })
      .catch(() => setBanner("Couldn't load this conversation."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeConversationId]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 220) + "px";
  }, [input]);

  async function loadOlder() {
    if (!convId || !messages[0]?.created_at) return;
    const el = scrollRef.current;
    const prevH = el?.scrollHeight ?? 0;
    const older = await loadMessages(convId, messages[0].created_at);
    stick.current = false;
    setMessages((m) => [...older, ...m]);
    setHasOlder(older.length === HISTORY_PAGE);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevH;
    });
  }

  async function run(opts: { content?: string; regenerate?: boolean }) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBanner(null);
    const clientMessageId = crypto.randomUUID();
    const assistantId = "a-" + clientMessageId;
    const userText = opts.content ?? "";
    stick.current = true;
    setMessages((m) => {
      let next = m;
      if (opts.regenerate) {
        const last = next[next.length - 1];
        if (last?.role === "assistant") next = next.slice(0, -1);
      } else next = [...next, { id: "u-" + clientMessageId, role: "user", content: userText, status: "complete" }];
      return [...next, { id: assistantId, role: "assistant", content: "", status: "streaming" }];
    });
    if (!opts.regenerate) setInput("");
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    const fail = (message: string, restore: boolean) => {
      if (restore) {
        // Request never reached the model: roll back optimistic messages and keep the user's text
        setMessages((m) => m.filter((x) => x.id !== assistantId && x.id !== "u-" + clientMessageId));
        if (!opts.regenerate) setInput(userText);
        setBanner(message);
      } else {
        setMessages((m) =>
          m.map((x) => (x.id === assistantId ? { ...x, status: x.content ? "incomplete" : "error", error: message } : x)),
        );
      }
    };

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: await authHeader() },
        body: JSON.stringify({ conversationId: convId ?? null, content: userText, clientMessageId, regenerate: !!opts.regenerate }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; resets_at?: string } } | null;
        if (res.status === 401) {
          fail("Your session has expired. Please sign in again.", true);
          setTimeout(() => navigate({ to: "/auth" }), 1200);
        } else {
          let msg = j?.error?.message ?? "Something went wrong. Please try again.";
          if (j?.error?.resets_at) msg += ` Resets at ${new Date(j.error.resets_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`;
          fail(msg, true);
        }
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finished = false;
      let errored = false;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const line = chunk.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const ev = JSON.parse(line.slice(5)) as
            | { type: "meta"; conversationId: string }
            | { type: "delta"; text: string }
            | { type: "done" }
            | { type: "error"; message: string };
          if (ev.type === "meta") {
            if (!convId) {
              setConvId(ev.conversationId);
              navigate({ to: "/chat/$conversationId", params: { conversationId: ev.conversationId }, replace: true });
            }
            qc.invalidateQueries({ queryKey: ["conversations"] });
          } else if (ev.type === "delta") {
            setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, content: x.content + ev.text } : x)));
          } else if (ev.type === "done") {
            finished = true;
            setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, status: "complete" } : x)));
          } else if (ev.type === "error") {
            errored = true;
            fail(ev.message, false);
          }
        }
      }
      if (!finished && !errored) fail("The response was interrupted.", false);
    } catch (e) {
      if (controller.signal.aborted) {
        setMessages((m) => m.map((x) => (x.id === assistantId ? { ...x, status: x.content ? "incomplete" : "error", error: "Stopped." } : x)));
      } else {
        fail("Network error — check your connection and try again.", false);
      }
    } finally {
      setStreaming(false);
      inFlight.current = false;
      abortRef.current = null;
      qc.invalidateQueries({ queryKey: ["plan"] });
    }
  }

  const send = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || content.length > MAX_CHARS || streaming) return;
    run({ content });
  };

  const empty = !loading && messages.length === 0;
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        {loading && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {empty && (
          <div className="flex h-full flex-col items-center justify-center px-4 pb-10">
            <h1 className="text-center text-2xl font-medium tracking-tight sm:text-3xl">How can I help you today?</h1>
            <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => send(s.prompt)}
                  disabled={streaming}
                  className="flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <s.icon className="h-4 w-4 shrink-0" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {!loading && messages.length > 0 && (
          <div className="mx-auto w-full max-w-3xl px-4 pb-8 pt-4">
            {hasOlder && (
              <div className="mb-4 text-center">
                <button onClick={loadOlder} className="text-sm text-muted-foreground hover:text-foreground">
                  Load earlier messages
                </button>
              </div>
            )}
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="group mb-6 flex flex-col items-end">
                  <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-secondary px-4 py-2.5 text-secondary-foreground">
                    {m.content}
                  </div>
                  <div className="mt-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <CopyButton text={m.content} />
                  </div>
                </div>
              ) : (
                <div key={m.id} className="group mb-8 flex gap-3">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border">
                    <LogoMark className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {m.status === "streaming" && !m.content ? (
  <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/5 px-3 py-3 text-sm text-muted-foreground">
    <Loader2 className="h-4 w-4 animate-spin text-sky-500" />
    <span>ZennAI sedang menganalisis permintaan...</span>
  </div>
) : (
  m.content && <Markdown content={m.content} />
)}
                    {(m.status === "error" || m.status === "incomplete") && (
                      <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4 text-destructive" />
                        <span>{m.error ?? (m.status === "incomplete" ? "This response is incomplete." : "This response failed.")}</span>
                      </div>
                    )}
                    {m.status !== "streaming" && (
                      <div
                        className={cn(
                          "mt-2 flex items-center gap-1 transition-opacity",
                          m.id === lastAssistant?.id ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
                        )}
                      >
                        {m.content && <CopyButton text={m.content} />}
                        {m.id === lastAssistant?.id && (
                          <button
                            type="button"
                            onClick={() => run({ regenerate: true })}
                            disabled={streaming}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            {m.status === "complete" ? "Regenerate" : "Retry"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
        <div className="mx-auto w-full max-w-3xl">
          {banner && (
            <div role="alert" className="mb-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <span>{banner}</span>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="rounded-3xl border bg-composer px-3 py-2 transition-colors focus-within:border-ring/60"
          >
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Message ZennAI"
              aria-label="Message ZennAI"
              className="block max-h-[220px] w-full resize-none bg-transparent px-2 py-2 text-[0.95rem] outline-none placeholder:text-muted-foreground focus-visible:outline-none"
            />
            <div className="flex items-center justify-between gap-2 pl-2">
              <span className={cn("text-xs", input.length > MAX_CHARS ? "text-destructive" : "text-muted-foreground")}>
                {input.length > MAX_CHARS * 0.8 ? `${input.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()}` : ""}
              </span>
              {streaming ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  aria-label="Stop generating"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || input.length > MAX_CHARS}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity disabled:opacity-30"
                  aria-label="Send message"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>
          <p className="mt-2 text-center text-xs text-muted-foreground">ZennAI can make mistakes. Check important info.</p>
        </div>
      </div>
    </div>
  );
}
