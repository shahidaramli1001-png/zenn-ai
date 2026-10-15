import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { PanelLeftOpen, Menu, SquarePen } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

export function AppShell({ children, title }: { children: ReactNode; title?: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    setCollapsed(localStorage.getItem("zenn-sidebar") === "collapsed");
  }, []);
  const toggle = (v: boolean) => {
    setCollapsed(v);
    localStorage.setItem("zenn-sidebar", v ? "collapsed" : "open");
  };

  return (
    <div className="flex h-dvh overflow-hidden">
      {!collapsed && (
        <aside className="hidden w-64 shrink-0 border-r border-sidebar-border md:block">
          <Sidebar onCollapse={() => toggle(true)} />
        </aside>
      )}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[85vw] max-w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-1 px-2 sm:px-3">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open sidebar">
            <Menu />
          </Button>
          {collapsed && (
            <>
              <Button variant="ghost" size="icon" className="hidden md:inline-flex" onClick={() => toggle(false)} aria-label="Expand sidebar">
                <PanelLeftOpen />
              </Button>
              <Button asChild variant="ghost" size="icon" className="hidden md:inline-flex" aria-label="New chat">
                <Link to="/chat"><SquarePen /></Link>
              </Button>
            </>
          )}
          <div className="min-w-0 flex-1 truncate px-1 text-sm font-medium">{title}</div>
          <Button asChild variant="ghost" size="icon" className="md:hidden" aria-label="New chat">
            <Link to="/chat"><SquarePen /></Link>
          </Button>
        </header>
        <div className="min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
