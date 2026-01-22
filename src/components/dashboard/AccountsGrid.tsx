import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Play, Pause, AlertCircle } from "lucide-react";

interface Account {
  id: string;
  name: string;
  handle: string;
  platform: "tiktok" | "instagram";
  vertical: "privacy" | "education" | "health";
  followers: number;
  engagement: number;
  status: "active" | "paused" | "warmup" | "flagged";
  videosToday: number;
  trend: number;
}

const accounts: Account[] = [
  { id: "1", name: "Footprint Finder", handle: "@FootprintFinder", platform: "tiktok", vertical: "privacy", followers: 45200, engagement: 8.2, status: "active", videosToday: 3, trend: 12 },
  { id: "2", name: "Privacy Shield", handle: "@PrivacyShield", platform: "instagram", vertical: "privacy", followers: 32100, engagement: 6.8, status: "active", videosToday: 2, trend: 8 },
  { id: "3", name: "Career Boost", handle: "@CareerBoostHQ", platform: "tiktok", vertical: "education", followers: 78500, engagement: 11.4, status: "active", videosToday: 4, trend: 23 },
  { id: "4", name: "Resume Pro", handle: "@ResumeProTips", platform: "instagram", vertical: "education", followers: 24800, engagement: 7.1, status: "warmup", videosToday: 1, trend: 5 },
  { id: "5", name: "Stroke Recovery", handle: "@StrokeRecovery", platform: "tiktok", vertical: "health", followers: 18300, engagement: 9.5, status: "active", videosToday: 2, trend: -3 },
  { id: "6", name: "Data Eraser", handle: "@DataEraserPro", platform: "tiktok", vertical: "privacy", followers: 12400, engagement: 5.2, status: "paused", videosToday: 0, trend: 0 },
  { id: "7", name: "Interview Ace", handle: "@InterviewAce", platform: "instagram", vertical: "education", followers: 56700, engagement: 10.2, status: "active", videosToday: 3, trend: 18 },
  { id: "8", name: "Brain Health", handle: "@BrainHealthTips", platform: "instagram", vertical: "health", followers: 9800, engagement: 4.8, status: "flagged", videosToday: 0, trend: -8 },
];

const verticalColors = {
  privacy: "from-cyan-500/20 to-blue-500/20 border-cyan-500/30",
  education: "from-emerald-500/20 to-teal-500/20 border-emerald-500/30",
  health: "from-rose-500/20 to-pink-500/20 border-rose-500/30",
};

const verticalLabels = {
  privacy: { label: "Privacy", color: "text-cyan-400" },
  education: { label: "Education", color: "text-emerald-400" },
  health: { label: "Health", color: "text-rose-400" },
};

export function AccountsGrid() {
  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold">Account Network</h3>
          <p className="text-sm text-muted-foreground">
            8 of 50 accounts shown • 6 active
          </p>
        </div>
        <div className="flex gap-4 text-xs">
          {Object.entries(verticalLabels).map(([key, { label, color }]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={cn("w-2 h-2 rounded-full", color.replace("text-", "bg-"))} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {accounts.map((account, index) => (
          <AccountCard key={account.id} account={account} index={index} />
        ))}
      </div>
    </div>
  );
}

function AccountCard({ account, index }: { account: Account; index: number }) {
  const StatusIcon = account.status === "active" ? Play : 
                     account.status === "paused" ? Pause : 
                     account.status === "flagged" ? AlertCircle : Play;

  return (
    <div
      className={cn(
        "relative p-4 rounded-lg border bg-gradient-to-br transition-all duration-300 hover:scale-[1.02] cursor-pointer animate-fade-in",
        verticalColors[account.vertical]
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Status indicator */}
      <div className="absolute top-3 right-3">
        <div
          className={cn(
            "w-2 h-2 rounded-full",
            account.status === "active" && "bg-success status-pulse",
            account.status === "paused" && "bg-muted-foreground",
            account.status === "warmup" && "bg-warning",
            account.status === "flagged" && "bg-destructive status-pulse"
          )}
        />
      </div>

      {/* Platform badge */}
      <div className={cn("platform-badge mb-3", account.platform)}>
        {account.platform === "tiktok" ? "TikTok" : "Instagram"}
      </div>

      {/* Account info */}
      <h4 className="font-semibold text-sm mb-0.5">{account.name}</h4>
      <p className="text-xs text-muted-foreground mb-3">{account.handle}</p>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground">Followers</p>
          <p className="font-mono font-medium">{formatNumber(account.followers)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Engagement</p>
          <p className="font-mono font-medium">{account.engagement}%</p>
        </div>
      </div>

      {/* Trend and videos */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
        <div className="flex items-center gap-1">
          {account.trend > 0 ? (
            <TrendingUp className="w-3 h-3 text-success" />
          ) : account.trend < 0 ? (
            <TrendingDown className="w-3 h-3 text-destructive" />
          ) : null}
          <span
            className={cn(
              "text-xs font-mono",
              account.trend > 0 && "text-success",
              account.trend < 0 && "text-destructive",
              account.trend === 0 && "text-muted-foreground"
            )}
          >
            {account.trend > 0 ? "+" : ""}{account.trend}%
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {account.videosToday} videos today
        </span>
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}
