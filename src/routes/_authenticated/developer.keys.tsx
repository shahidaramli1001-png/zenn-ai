import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { KeyRound, Loader2, Plus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { keysQuery } from "@/lib/dev-queries";
import { createApiKey, revokeApiKey } from "@/lib/account.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/chat/Markdown";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/developer/keys")({ component: Keys });

function Keys() {
  const qc = useQueryClient();
  const keys = useQuery(keysQuery);
  const create = useServerFn(createApiKey);
  const revoke = useServerFn(revokeApiKey);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<{ id: string; label: string } | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const r = await create({ data: { label } });
      setCreated(r.key);
      setLabel("");
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create key");
    } finally {
      setBusy(false);
    }
  }
  async function onRevoke() {
    if (!revoking) return;
    try {
      await revoke({ data: { id: revoking.id } });
      toast.success("Key revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke key");
    }
    setRevoking(null);
    qc.invalidateQueries({ queryKey: ["api-keys"] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">Keep keys on a trusted server. Never put them in browser code.</p>
        </div>
        <Button onClick={() => { setCreated(null); setOpen(true); }}><Plus /> Create key</Button>
      </div>

      {keys.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !keys.data?.length ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <KeyRound className="mx-auto h-5 w-5 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No API keys yet.</p>
        </div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {keys.data.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  {k.label}
                  {k.revoked_at ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Revoked</span>
                  ) : (
                    <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs">Active</span>
                  )}
                </div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">{k.key_prefix}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Created {new Date(k.created_at!).toLocaleDateString()} · {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleString()}` : "Never used"}
                </div>
              </div>
              {!k.revoked_at && (
                <Button variant="outline" size="sm" onClick={() => setRevoking({ id: k.id!, label: k.label! })}>Revoke</Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCreated(null); }}>
        <DialogContent>
          {created ? (
            <>
              <DialogHeader>
                <DialogTitle>Save your API key</DialogTitle>
                <DialogDescription>This is the only time the full key will be shown.</DialogDescription>
              </DialogHeader>
              <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                Copy it now and store it securely. ZennAI stores only a hash and cannot show it again.
              </div>
              <div className="flex items-center gap-2 rounded-lg border bg-code p-2">
                <code className="min-w-0 flex-1 break-all font-mono text-xs">{created}</code>
                <CopyButton text={created} />
              </div>
              <DialogFooter><Button onClick={() => { setOpen(false); setCreated(null); }}>Done</Button></DialogFooter>
            </>
          ) : (
            <form onSubmit={onCreate}>
              <DialogHeader><DialogTitle>Create API key</DialogTitle></DialogHeader>
              <div className="mt-4 space-y-1.5">
                <Label htmlFor="label">Label</Label>
                <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="e.g. Telegram bot" autoFocus />
              </div>
              <DialogFooter className="mt-6">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={!label.trim() || busy}>{busy && <Loader2 className="animate-spin" />}Create</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revoking} onOpenChange={(o) => !o && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke “{revoking?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>Apps using this key will stop working immediately. Usage history is kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRevoke} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Revoke</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
