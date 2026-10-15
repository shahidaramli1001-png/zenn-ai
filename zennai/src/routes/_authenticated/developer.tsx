import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/developer")({
  head: () => ({
    meta: [
      { title: "Developer dashboard — ZennAI" },
      { name: "description", content: "Manage ZennAI API keys and usage." },
      { property: "og:title", content: "Developer dashboard — ZennAI" },
      { property: "og:description", content: "Manage ZennAI API keys and usage." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DevLayout,
});

const tabs = [
  { to: "/developer", label: "Overview", exact: true },
  { to: "/developer/keys", label: "API keys" },
  { to: "/developer/usage", label: "Usage" },
  { to: "/docs", label: "Documentation" },
] as const;

function DevLayout() {
  return (
    <AppShell title="Developer">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 pb-16 pt-2">
          <nav className="mb-8 flex gap-1 overflow-x-auto border-b" aria-label="Developer sections">
            {tabs.map((t) => (
              <Link
                key={t.to}
                to={t.to}
                activeOptions={{ exact: "exact" in t }}
                className={cn("-mb-px whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground hover:text-foreground")}
                activeProps={{ className: "border-foreground! text-foreground!" }}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
