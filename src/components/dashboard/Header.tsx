import { Activity, Bell, Settings, Zap, FileText, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-50 glass-card rounded-none border-x-0 border-t-0">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow-primary">
                <Zap className="w-5 h-5 text-primary-foreground" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-success rounded-full border-2 border-background" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Content Engine</h1>
              <p className="text-xs text-muted-foreground">Short-Form Automation</p>
            </div>
          </div>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-2">
            <Link to="/scripts">
              <Button variant="ghost" size="sm" className="gap-2">
                <FileText className="w-4 h-4" />
                Scripts
              </Button>
            </Link>
            <Link to="/qa-review">
              <Button variant="ghost" size="sm" className="gap-2">
                <ShieldCheck className="w-4 h-4" />
                QA Review
              </Button>
            </Link>
          </div>

          {/* Status bar */}
          <div className="hidden lg:flex items-center gap-6">
            <StatusPill 
              icon={Activity} 
              label="Pipeline" 
              status="Running" 
              variant="success" 
            />
            <StatusPill 
              icon={Zap} 
              label="API Usage" 
              status="$12.40 today" 
              variant="default" 
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button className="p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors relative">
              <Bell className="w-4 h-4 text-muted-foreground" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-warning rounded-full" />
            </button>
            <button className="p-2.5 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors">
              <Settings className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function StatusPill({ 
  icon: Icon, 
  label, 
  status, 
  variant = "default" 
}: { 
  icon: typeof Activity; 
  label: string; 
  status: string; 
  variant?: "default" | "success" | "warning" 
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/30 border border-border/50">
      <Icon className={cn(
        "w-3.5 h-3.5",
        variant === "success" && "text-success",
        variant === "warning" && "text-warning",
        variant === "default" && "text-primary"
      )} />
      <span className="text-xs text-muted-foreground">{label}:</span>
      <span className={cn(
        "text-xs font-medium",
        variant === "success" && "text-success",
        variant === "warning" && "text-warning",
        variant === "default" && "text-foreground"
      )}>{status}</span>
    </div>
  );
}
