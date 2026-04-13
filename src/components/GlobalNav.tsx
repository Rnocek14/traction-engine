/**
 * GlobalNav - Persistent top navigation bar
 * 
 * Always visible. Never clever. Four workspaces.
 * Dashboard | Produce | Review | Settings
 */

import { Link, useLocation } from "react-router-dom";
import { Zap, LayoutDashboard, Lightbulb, Clapperboard, ShieldCheck, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthHeader } from "@/components/auth/AuthHeader";

const NAV_ITEMS = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard },
  { label: "Ideas", path: "/ideas", icon: Lightbulb },
  { label: "Produce", path: "/produce", icon: Clapperboard },
  { label: "Review", path: "/review", icon: ShieldCheck },
  { label: "Settings", path: "/settings", icon: Settings },
] as const;

export function GlobalNav() {
  const location = useLocation();
  
  const isActive = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

  return (
    <header className="sticky top-0 z-50 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="h-full px-4 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm hidden sm:inline">Content Engine</span>
          </Link>
          
          {/* Nav Links */}
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ label, path, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  isActive(path)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden md:inline">{label}</span>
              </Link>
            ))}
          </nav>
        </div>

        {/* Right side - Auth */}
        <AuthHeader />
      </div>
    </header>
  );
}
