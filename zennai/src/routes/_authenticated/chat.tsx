import { createFileRoute, Outlet, useParams } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { ChatView } from "@/components/chat/ChatView";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Chat — ZennAI" },
      { name: "description", content: "Chat with ZennAI." },
      { property: "og:title", content: "Chat — ZennAI" },
      { property: "og:description", content: "Chat with ZennAI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatLayout,
});

function ChatLayout() {
  const params = useParams({ strict: false }) as { conversationId?: string };
  return (
    <AppShell title="ZennAI">
      {/* The chat view stays mounted across child routes so streams survive URL changes. */}
      <ChatView routeConversationId={params.conversationId} />
      <Outlet />
    </AppShell>
  );
}
