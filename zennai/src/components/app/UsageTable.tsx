import type { UsageRow } from "@/lib/dev-queries";
import { cn } from "@/lib/utils";

export function UsageTable({ rows, loading }: { rows: UsageRow[]; loading?: boolean }) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!rows.length)
    return <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No requests yet.</div>;
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Source</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Tokens in / out</th>
            <th className="px-3 py-2 font-medium">Request ID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="whitespace-nowrap px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
              <td className="px-3 py-2">{r.source === "api" ? "API" : "Web"}</td>
              <td className="px-3 py-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs", r.status === "success" ? "bg-brand/15 text-foreground" : "bg-muted text-muted-foreground")}>
                  {r.status}{r.error_code ? ` · ${r.error_code}` : ""}
                </span>
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                {r.input_tokens ?? "—"} / {r.output_tokens ?? "—"}
                {r.tokens_estimated && <span className="ml-1 text-xs text-muted-foreground" title="Estimated — provider did not report usage">est.</span>}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.request_id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
