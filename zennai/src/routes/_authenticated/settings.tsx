import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2, Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme, type ThemePref } from "@/lib/theme";
import { planQuery } from "@/lib/dev-queries";
import { deleteAccount } from "@/lib/account.functions";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — ZennAI" },
      { name: "description", content: "Manage your ZennAI account." },
      { property: "og:title", content: "Settings — ZennAI" },
      { property: "og:description", content: "Manage your ZennAI account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b py-6 last:border-0">
      <h2 className="mb-4 font-medium">{title}</h2>
      {children}
    </section>
  );
}

function Settings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const plan = useQuery(planQuery);
  const del = useServerFn(deleteAccount);
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setEmail(data.user.email ?? "");
      setUid(data.user.id);
      const { data: p } = await supabase.from("profiles").select("display_name").eq("id", data.user.id).maybeSingle();
      setName(p?.display_name ?? "");
    });
  }, []);

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: name.trim().slice(0, 80) || null }).eq("id", uid);
    setSaving(false);
    error ? toast.error("Could not save") : toast.success("Saved");
  }

  const themes: { v: ThemePref; label: string; icon: typeof Sun }[] = [
    { v: "light", label: "Light", icon: Sun },
    { v: "dark", label: "Dark", icon: Moon },
    { v: "system", label: "System", icon: Monitor },
  ];

  return (
    <AppShell title="Settings">
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 pb-16">
          <h1 className="pt-2 text-2xl font-semibold tracking-tight">Settings</h1>
          <Section title="Profile">
            <form onSubmit={saveName} className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="dn">Display name</Label>
                <Input id="dn" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
              </div>
              <Button type="submit" className="self-end" disabled={saving}>{saving && <Loader2 className="animate-spin" />}Save</Button>
            </form>
          </Section>
          <Section title="Appearance">
            <div className="inline-flex rounded-xl border p-1" role="radiogroup" aria-label="Theme">
              {themes.map((t) => (
                <button
                  key={t.v}
                  role="radio"
                  aria-checked={theme === t.v}
                  onClick={() => setTheme(t.v)}
                  className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm", theme === t.v ? "bg-secondary" : "text-muted-foreground")}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Account">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Email</dt><dd className="truncate">{email}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Plan</dt><dd>Free</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={async () => {
                  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
                  error ? toast.error(error.message) : toast.success("Password reset email sent");
                }}
              >
                Send password reset email
              </Button>
              <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>Sign out</Button>
            </div>
          </Section>
          <Section title="Usage limits">
            {plan.data ? (
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>{plan.data.dailyRequests} requests per day (used {plan.data.usedToday} today)</li>
                <li>{plan.data.userPerMinute} requests per minute</li>
                <li>Up to {plan.data.maxInputChars.toLocaleString()} characters of input per request</li>
                <li>Up to {plan.data.maxOutputTokens} output tokens per response</li>
                <li>Resets daily at 00:00 UTC</li>
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Loading…</p>
            )}
          </Section>
          <Section title="Danger zone">
            <p className="mb-3 text-sm text-muted-foreground">Permanently delete your account, chats, API keys and usage history.</p>
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>Delete account</Button>
          </Section>
        </div>
      </div>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete your account?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone. Type DELETE to confirm.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} aria-label="Type DELETE to confirm" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={confirmText !== "DELETE" || deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  await del({ data: { confirm: "DELETE" } });
                  await supabase.auth.signOut();
                  navigate({ to: "/" });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Could not delete account");
                  setDeleting(false);
                }
              }}
            >
              {deleting && <Loader2 className="animate-spin" />}Delete forever
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
