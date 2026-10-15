import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  SquarePen, Search, PanelLeftClose, MoreHorizontal, Pencil, Trash2, Settings, KeyRound, BookOpen, LogOut, Loader2, User,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchConversations, groupByDate, PAGE, type Conversation } from "@/lib/conversations";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function Sidebar({ onCollapse, onNavigate }: { onCollapse?: () => void; onNavigate?: () => void }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [email, setEmail] = useState("");
  const [renaming, setRenaming] = useState<Conversation | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [deleting, setDeleting] = useState<Conversation | null>(null);
  const params = useParams({ strict: false }) as { conversationId?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  const q = useInfiniteQuery({
    queryKey: ["conversations", debounced],
    queryFn: ({ pageParam }) => fetchConversations(debounced, pageParam),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length : undefined),
  });
  const items = q.data?.pages.flat() ?? [];
  const groups = groupByDate(items);

  async function doRename() {
    if (!renaming) return;
    const title = newTitle.trim().slice(0, 200);
    if (!title) return;
    const { error } = await supabase.from("conversations").update({ title }).eq("id", renaming.id);
    if (error) toast.error("Could not rename conversation");
    setRenaming(null);
    qc.invalidateQueries({ queryKey: ["conversations"] });
  }
  async function doDelete() {
    if (!deleting) return;
    const { error } = await supabase.from("conversations").delete().eq("id", deleting.id);
    if (error) toast.error("Could not delete conversation");
    if (params.conversationId === deleting.id) navigate({ to: "/chat" });
    setDeleting(null);
    qc.invalidateQueries({ queryKey: ["conversations"] });
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center justify-between px-3">
        <Link to="/chat" onClick={onNavigate} className="rounded-md px-1" aria-label="ZennAI">
          <Logo />
        </Link>
        {onCollapse && (
          <Button variant="ghost" size="icon" onClick={onCollapse} aria-label="Collapse sidebar">
            <PanelLeftClose />
          </Button>
        )}
      </div>
      <div className="space-y-2 px-3">
        <Button asChild variant="ghost" className="w-full justify-start gap-2 px-2">
          <Link to="/chat" onClick={onNavigate}>
            <SquarePen /> New chat
          </Link>
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats"
            aria-label="Search conversations"
            className="h-9 border-transparent bg-sidebar-accent/60 pl-8 shadow-none"
          />
        </div>
      </div>
      <nav className="mt-3 flex-1 overflow-y-auto px-2 pb-2" aria-label="Conversation history">
        {q.isLoading && <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>}
        {q.isError && <p className="px-2 py-3 text-sm text-destructive">Couldn't load chats.</p>}
        {!q.isLoading && items.length === 0 && (
          <p className="px-2 py-3 text-sm text-muted-foreground">{debounced ? "No matching chats." : "No chats yet."}</p>
        )}
        {groups.map((g) => (
          <div key={g.label} className="mb-3">
            <h3 className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{g.label}</h3>
            <ul>
              {g.items.map((c) => (
                <li key={c.id} className="group relative">
                  <Link
                    to="/chat/$conversationId"
                    params={{ conversationId: c.id }}
                    onClick={onNavigate}
                    className={cn(
                      "block truncate rounded-lg px-2 py-2 pr-8 text-sm hover:bg-sidebar-accent",
                      params.conversationId === c.id && "bg-sidebar-accent font-medium",
                    )}
                  >
                    {c.title}
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground opacity-100 hover:text-foreground focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 data-[state=open]:opacity-100"
                      aria-label={`Options for ${c.title}`}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onSelect={() => { setNewTitle(c.title); setRenaming(c); }}>
                        <Pencil /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleting(c)}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {q.hasNextPage && (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
            {q.isFetchingNextPage ? <Loader2 className="animate-spin" /> : "Load more"}
          </Button>
        )}
      </nav>
      <div className="border-t border-sidebar-border p-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-sidebar-accent">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {email ? email[0].toUpperCase() : <User className="h-4 w-4" />}
            </span>
            <span className="truncate">{email || "Account"}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/settings" onClick={onNavigate}><Settings /> Settings</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/developer" onClick={onNavigate}><KeyRound /> API dashboard</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/docs"><BookOpen /> Documentation</Link></DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={async () => { await supabase.auth.signOut(); navigate({ to: "/" }); }}>
              <LogOut /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename chat</DialogTitle></DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); doRename(); }}>
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={200} autoFocus aria-label="Chat title" />
            <DialogFooter className="mt-4">
              <Button type="button" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
              <Button type="submit" disabled={!newTitle.trim()}>Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>“{deleting?.title}” and all its messages will be permanently deleted.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
