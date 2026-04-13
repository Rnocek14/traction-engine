import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { TrendingUp, Loader2 } from "lucide-react";
import { useAccounts } from "@/hooks/use-accounts";
import { Badge } from "@/components/ui/badge";

const verticalColors: Record<string, string> = {
  privacy: "from-cyan-500/20 to-blue-500/20 border-cyan-500/30",
  education: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
  health: "from-rose-500/20 to-pink-500/20 border-rose-500/30",
  gadgets: "from-amber-500/20 to-orange-500/20 border-amber-500/30",
  home: "from-violet-500/20 to-purple-500/20 border-violet-500/30",
  toys: "from-yellow-500/20 to-lime-500/20 border-yellow-500/30",
  ecommerce: "from-indigo-500/20 to-blue-500/20 border-indigo-500/30",
};

const verticalLabels: Record<string, { label: string; color: string }> = {
  privacy: { label: "Privacy", color: "bg-cyan-400" },
  education: { label: "Education", color: "bg-emerald-400" },
  health: { label: "Health", color: "bg-rose-400" },
  gadgets: { label: "Gadgets", color: "bg-amber-400" },
  home: { label: "Home", color: "bg-violet-400" },
  toys: { label: "Toys", color: "bg-yellow-400" },
};

const monetizationBadge: Record<string, { label: string; class: string }> = {
  app_first: { label: "App", class: "bg-primary/10 text-primary border-primary/30" },
  product_first: { label: "Product", class: "bg-warning/10 text-warning border-warning/30" },
  hybrid: { label: "Hybrid", class: "bg-accent/10 text-accent-foreground border-accent/30" },
};

const statusConfig: Record<string, { class: string }> = {
  active: { class: "bg-success status-pulse" },
  paused: { class: "bg-muted-foreground" },
  warmup: { class: "bg-warning" },
  flagged: { class: "bg-destructive status-pulse" },
};

export function AccountsGrid() {
  const { data: accounts, isLoading } = useAccounts();

  if (isLoading) {
    return (
      <div className="glass-card p-6 flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeAccounts = accounts?.filter(a => a.status === "active") || [];
  const verticals = [...new Set(accounts?.map(a => a.vertical) || [])];

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Account Network</h3>
          <p className="text-sm text-muted-foreground">
            {accounts?.length || 0} accounts • {activeAccounts.length} active • {verticals.length} verticals
          </p>
        </div>
        <div className="flex gap-4 text-xs flex-wrap">
          {verticals.map((v) => {
            const meta = verticalLabels[v] || { label: v, color: "bg-muted-foreground" };
            return (
              <div key={v} className="flex items-center gap-1.5">
                <div className={cn("w-2 h-2 rounded-full", meta.color)} />
                <span className="text-muted-foreground">{meta.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {accounts?.map((account, index) => (
          <Link key={account.id} to={`/account/${account.account_id}`}>
            <div
              className={cn(
                "relative p-4 rounded-lg border bg-gradient-to-br transition-all duration-300 hover:scale-[1.02] cursor-pointer animate-fade-in",
                verticalColors[account.vertical] || "from-muted/20 to-muted/10 border-border"
              )}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              {/* Status indicator */}
              <div className="absolute top-3 right-3">
                <div className={cn("w-2 h-2 rounded-full", statusConfig[account.status]?.class || "bg-muted-foreground")} />
              </div>

              {/* Platform + monetization badges */}
              <div className="flex items-center gap-2 mb-3">
                <div className={cn("platform-badge", account.platform)}>
                  {account.platform === "tiktok" ? "TikTok" : account.platform === "instagram" ? "Instagram" : "YT Shorts"}
                </div>
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", monetizationBadge[account.monetization_mode]?.class)}>
                  {monetizationBadge[account.monetization_mode]?.label}
                </Badge>
              </div>

              {/* Account info */}
              <h4 className="font-semibold text-sm mb-0.5">{account.account_name || account.account_id}</h4>
              <p className="text-xs text-muted-foreground mb-3">{account.handle || `@${account.account_id}`}</p>

              {/* Promise */}
              <p className="text-xs text-muted-foreground/80 mb-3 line-clamp-2 italic">
                "{account.promise}"
              </p>

              {/* Metrics */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Posts/day</p>
                  <p className="font-mono font-medium">{account.posting_frequency_target}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Priority</p>
                  <p className="font-mono font-medium">{account.priority_score}</p>
                </div>
              </div>

              {/* Product categories */}
              {account.allowed_product_categories && account.allowed_product_categories.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border/30">
                  <div className="flex flex-wrap gap-1">
                    {account.allowed_product_categories.slice(0, 3).map(cat => (
                      <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/50 text-muted-foreground">
                        {cat}
                      </span>
                    ))}
                    {account.allowed_product_categories.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{account.allowed_product_categories.length - 3}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
