import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { planQuery, usageQuery } from "@/lib/dev-queries";
import { UsageTable } from "@/components/app/UsageTable";

export const Route = createFileRoute("/_authenticated/developer/")({ component: Overview });

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string | undefined }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Overview() {
  const plan = useQuery(planQuery);
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const usage = useQuery(usageQuery(since));
  const p = plan.data;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Free plan. Limits apply to both website chat and API requests.</p>
      </div>
      {p && !p.aiConfigured && (
        <div className="flex gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          AI provider is not configured on the server yet, so requests will fail until AI_API_KEY is set.
        </div>
      )}
      {p?.aiConfigured && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-brand" /> AI provider configured
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Requests today" value={p ? p.usedToday : "—"} />
        <Stat label="Remaining today" value={p ? `${p.remaining} / ${p.dailyRequests}` : "—"} hint={p ? `Resets ${new Date(p.resetsAt).toLocaleString()}` : undefined} />
        <Stat label="Per-minute limit" value={p ? p.userPerMinute : "—"} hint="Per account and per key" />
      </div>
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-medium">Recent activity (7 days)</h2>
          <Link to="/developer/usage" className="text-sm text-muted-foreground hover:text-foreground">View all</Link>
        </div>
        <UsageTable rows={(usage.data ?? []).slice(0, 10)} loading={usage.isLoading} />
      </div>
    </div>
  );
}
