import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Play,
  Pause,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  Video,
  DollarSign,
  Settings,
  Activity,
  BarChart3,
  Mic,
  Palette,
  Shield,
  RefreshCw,
} from "lucide-react";

// Mock account data - would come from API
const getAccountData = (id: string) => ({
  id,
  name: "Footprint Finder",
  handle: "@FootprintFinder",
  platform: "tiktok" as const,
  vertical: "privacy",
  status: "active" as const,
  followers: 45200,
  following: 127,
  engagement: 8.2,
  trend: 12,
  videosToday: 3,
  videosThisWeek: 18,
  totalVideos: 234,
  monthlyViews: 1240000,
  monthlyRevenue: 847,
  monthlyCost: 156,
  createdAt: "2024-11-15",
  lastPost: "23 minutes ago",
  
  // Configuration
  config: {
    voiceId: "Rachel",
    voiceProvider: "ElevenLabs",
    motifSet: "Digital Privacy A",
    postingSchedule: "3x daily (9am, 2pm, 7pm EST)",
    warmupMode: false,
    autoPublish: true,
    maxDailyPosts: 4,
  },

  // Health metrics
  health: {
    accountAge: 67,
    trustScore: 94,
    warningLevel: "none" as const,
    lastWarning: null,
    shadowbanRisk: "low",
    contentDiversity: 78,
    engagementConsistency: 85,
  },

  // Recent outputs
  recentVideos: [
    { id: "v1", title: "Privacy Tip #47: Browser Fingerprinting", views: 12400, likes: 890, shares: 234, status: "published", publishedAt: "23m ago" },
    { id: "v2", title: "Your Phone is Tracking You", views: 8900, likes: 654, shares: 178, status: "published", publishedAt: "4h ago" },
    { id: "v3", title: "Delete These Apps NOW", views: 23100, likes: 1890, shares: 567, status: "published", publishedAt: "8h ago" },
    { id: "v4", title: "Data Broker Exposed", views: 0, likes: 0, shares: 0, status: "processing", publishedAt: "—" },
    { id: "v5", title: "Privacy Settings You Missed", views: 0, likes: 0, shares: 0, status: "queued", publishedAt: "—" },
  ],

  // Health history
  healthHistory: [
    { date: "Today", event: "Posted 3 videos", type: "success" },
    { date: "Yesterday", event: "Engagement spike (+23%)", type: "success" },
    { date: "3 days ago", event: "Video went semi-viral (56K views)", type: "success" },
    { date: "5 days ago", event: "Warmup period completed", type: "info" },
    { date: "1 week ago", event: "Minor reach dip detected", type: "warning" },
  ],
});

export default function AccountDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const account = getAccountData(accountId || "1");

  // Guard against division by zero for ROI calculation
  const roi = account.monthlyCost > 0
    ? ((account.monthlyRevenue - account.monthlyCost) / account.monthlyCost) * 100
    : null;
  const roiPositive = roi !== null && roi > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
              </Link>
              <div className="h-8 w-px bg-border" />
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold">{account.name}</h1>
                  <Badge className={cn(
                    "platform-badge",
                    account.platform === "tiktok" ? "tiktok" : "instagram"
                  )}>
                    {account.platform === "tiktok" ? "TikTok" : "Instagram"}
                  </Badge>
                  <StatusBadge status={account.status} />
                </div>
                <p className="text-sm text-muted-foreground">{account.handle}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary/50">
                <span className="text-xs text-muted-foreground">Auto-publish</span>
                <Switch checked={account.config.autoPublish} />
              </div>
              <Button variant="outline" size="sm" className="gap-2">
                <Settings className="w-4 h-4" />
                Configure
              </Button>
              <Button 
                variant={account.status === "active" ? "destructive" : "default"} 
                size="sm" 
                className="gap-2"
              >
                {account.status === "active" ? (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause Account
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Resume Account
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Key Metrics Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <MetricCard 
            label="Followers" 
            value={formatNumber(account.followers)} 
            trend={account.trend} 
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <MetricCard 
            label="Engagement" 
            value={`${account.engagement}%`} 
            icon={<Activity className="w-4 h-4" />}
          />
          <MetricCard 
            label="Monthly Views" 
            value={formatNumber(account.monthlyViews)} 
            icon={<BarChart3 className="w-4 h-4" />}
          />
          <MetricCard 
            label="Videos Today" 
            value={account.videosToday.toString()} 
            subtitle={`of ${account.config.maxDailyPosts} max`}
            icon={<Video className="w-4 h-4" />}
          />
          <MetricCard 
            label="Monthly Cost" 
            value={`$${account.monthlyCost}`} 
            icon={<DollarSign className="w-4 h-4" />}
          />
          <MetricCard 
            label="ROI" 
            value={roi !== null ? `${roiPositive ? '+' : ''}${roi.toFixed(0)}%` : '—'} 
            variant={roi === null ? undefined : roiPositive ? "success" : "destructive"}
            icon={<TrendingUp className="w-4 h-4" />}
          />
        </div>

        {/* Account Health Card */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">Account Health</h3>
            </div>
            <Badge variant="outline" className="border-success text-success">
              Trust Score: {account.health.trustScore}%
            </Badge>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <HealthMetric 
              label="Account Age" 
              value={`${account.health.accountAge} days`}
              progress={Math.min(account.health.accountAge / 90 * 100, 100)}
            />
            <HealthMetric 
              label="Shadowban Risk" 
              value={account.health.shadowbanRisk}
              variant={account.health.shadowbanRisk === "low" ? "success" : "warning"}
            />
            <HealthMetric 
              label="Content Diversity" 
              value={`${account.health.contentDiversity}%`}
              progress={account.health.contentDiversity}
            />
            <HealthMetric 
              label="Engagement Consistency" 
              value={`${account.health.engagementConsistency}%`}
              progress={account.health.engagementConsistency}
            />
          </div>
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="videos" className="space-y-6">
          <TabsList className="bg-secondary/30">
            <TabsTrigger value="videos">Recent Videos</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="history">Health History</TabsTrigger>
          </TabsList>

          <TabsContent value="videos" className="space-y-4">
            <div className="glass-card overflow-hidden">
              <table className="w-full">
                <thead className="border-b border-border/50 bg-secondary/20">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Title</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Views</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Likes</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Shares</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground uppercase">Published</th>
                  </tr>
                </thead>
                <tbody>
                  {account.recentVideos.map((video) => (
                    <tr key={video.id} className="border-b border-border/30 hover:bg-secondary/10">
                      <td className="px-4 py-3 font-medium text-sm">{video.title}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm">{formatNumber(video.views)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm">{formatNumber(video.likes)}</td>
                      <td className="px-4 py-3 text-right font-mono text-sm">{formatNumber(video.shares)}</td>
                      <td className="px-4 py-3 text-right">
                        <VideoStatusBadge status={video.status} />
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-muted-foreground">{video.publishedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="config" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ConfigSection 
                title="Voice Settings" 
                icon={<Mic className="w-4 h-4" />}
                items={[
                  { label: "Voice ID", value: account.config.voiceId },
                  { label: "Provider", value: account.config.voiceProvider },
                ]}
              />
              <ConfigSection 
                title="Visual Settings" 
                icon={<Palette className="w-4 h-4" />}
                items={[
                  { label: "Motif Set", value: account.config.motifSet },
                ]}
              />
              <ConfigSection 
                title="Posting Schedule" 
                icon={<Calendar className="w-4 h-4" />}
                items={[
                  { label: "Schedule", value: account.config.postingSchedule },
                  { label: "Max Daily Posts", value: account.config.maxDailyPosts.toString() },
                ]}
              />
              <ConfigSection 
                title="Safety Settings" 
                icon={<Shield className="w-4 h-4" />}
                items={[
                  { label: "Warmup Mode", value: account.config.warmupMode ? "Enabled" : "Disabled" },
                  { label: "Auto-publish", value: account.config.autoPublish ? "Enabled" : "Disabled" },
                ]}
              />
            </div>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <div className="glass-card p-6">
              <div className="space-y-4">
                {account.healthHistory.map((event, i) => (
                  <div key={i} className="flex items-center gap-4 pb-4 border-b border-border/30 last:border-0">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      event.type === "success" && "bg-success",
                      event.type === "warning" && "bg-warning",
                      event.type === "info" && "bg-primary",
                      event.type === "error" && "bg-destructive"
                    )} />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{event.event}</p>
                      <p className="text-xs text-muted-foreground">{event.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config = {
    active: { label: "Active", class: "bg-success/10 text-success border-success/30" },
    paused: { label: "Paused", class: "bg-muted text-muted-foreground border-border" },
    warmup: { label: "Warmup", class: "bg-warning/10 text-warning border-warning/30" },
    flagged: { label: "Flagged", class: "bg-destructive/10 text-destructive border-destructive/30" },
  };
  const c = config[status as keyof typeof config] || config.active;
  return <Badge variant="outline" className={c.class}>{c.label}</Badge>;
}

function VideoStatusBadge({ status }: { status: string }) {
  const config = {
    published: { label: "Published", class: "bg-success/10 text-success" },
    processing: { label: "Processing", class: "bg-primary/10 text-primary" },
    queued: { label: "Queued", class: "bg-muted text-muted-foreground" },
    failed: { label: "Failed", class: "bg-destructive/10 text-destructive" },
  };
  const c = config[status as keyof typeof config] || config.queued;
  return <Badge className={c.class}>{c.label}</Badge>;
}

function MetricCard({ label, value, subtitle, trend, icon, variant }: { 
  label: string; 
  value: string; 
  subtitle?: string;
  trend?: number;
  icon: React.ReactNode;
  variant?: "success" | "destructive";
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={cn(
        "text-xl font-semibold font-mono",
        variant === "success" && "text-success",
        variant === "destructive" && "text-destructive"
      )}>
        {value}
      </p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          {trend >= 0 ? (
            <TrendingUp className="w-3 h-3 text-success" />
          ) : (
            <TrendingDown className="w-3 h-3 text-destructive" />
          )}
          <span className={cn(
            "text-xs font-mono",
            trend >= 0 ? "text-success" : "text-destructive"
          )}>
            {trend >= 0 ? '+' : ''}{trend}%
          </span>
        </div>
      )}
    </div>
  );
}

function HealthMetric({ label, value, progress, variant }: {
  label: string;
  value: string;
  progress?: number;
  variant?: "success" | "warning";
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className={cn(
          "text-sm font-medium",
          variant === "success" && "text-success",
          variant === "warning" && "text-warning"
        )}>
          {value}
        </span>
      </div>
      {progress !== undefined && <Progress value={progress} className="h-1.5" />}
    </div>
  );
}

function ConfigSection({ title, icon, items }: {
  title: string;
  icon: React.ReactNode;
  items: { label: string; value: string }[];
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-4 text-muted-foreground">
        {icon}
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{item.label}</span>
            <span className="text-sm font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
}
