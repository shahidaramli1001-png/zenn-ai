import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { planQuery, usageQuery } from "@/lib/dev-queries";
import { UsageTable } from "@/components/app/UsageTable";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/developer/usage")({ component: Usage });

const ranges = [
  { label: "Today", days: 0 },
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
];

function Usage() {
  const [days, setDays] = useState(7);
  const [page, setPage] = useState(0);
  const from = days === 0 ? new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString() : new Date(Date.now() - days * 86400000).toISOString().slice(0, 13) + ":00:00.000Z";
  const q = useQuery(usageQuery(from, page));
  const plan = useQuery(planQuery);
  const rows = q.data ?? [];
  const ok = rows.filter((r) => r.status === "success");
  const tin = ok.reduce((a, r) => a + (r.input_tokens ?? 0), 0);
  const tout = ok.reduce((a, r) => a + (r.output_tokens ?? 0), 0);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Usage</h1>
        {plan.data && (
          <p className="mt-1 text-sm text-muted-foreground">
            {plan.data.usedToday} of {plan.data.dailyRequests} requests used today. Quota resets daily at 00:00 UTC
            ({new Date(plan.data.resetsAt).toLocaleString()} your time).
          </p>
        )}
      </div>
      <div className="flex gap-1">
        {ranges.map((r) => (
          <button
            key={r.label}
            onClick={() => { setDays(r.days); setPage(0); }}
            className={cn("rounded-lg px-3 py-1.5 text-sm", days === r.days ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border p-4"><div className="text-sm text-muted-foreground">Requests (this page)</div><div className="text-2xl font-semibold">{rows.length}</div></div>
        <div className="rounded-xl border p-4"><div className="text-sm text-muted-foreground">Successful</div><div className="text-2xl font-semibold">{ok.length}</div></div>
        <div className="rounded-xl border p-4"><div className="text-sm text-muted-foreground">Tokens in / out</div><div className="text-2xl font-semibold tabular-nums">{tin} / {tout}</div></div>
      </div>
      <UsageTable rows={rows} loading={q.isLoading} />
      <div className="flex justify-between">
        <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="text-sm text-muted-foreground disabled:opacity-40">← Newer</button>
        <button disabled={rows.length < 100} onClick={() => setPage((p) => p + 1)} className="text-sm text-muted-foreground disabled:opacity-40">Older →</button>
      </div>
    </div>
  );
}
