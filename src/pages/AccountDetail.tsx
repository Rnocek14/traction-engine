import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAccount } from "@/hooks/use-accounts";
import {
  ArrowLeft,
  Play,
  Pause,
  Settings,
  Activity,
  Video,
  DollarSign,
  Mic,
  Palette,
  Calendar,
  Shield,
  Loader2,
  Package,
  Target,
  Zap,
} from "lucide-react";

export default function AccountDetail() {
  const { accountId } = useParams<{ accountId: string }>();
  const { data: account, isLoading } = useAccount(accountId || "");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Account not found</p>
        <Link to="/"><Button variant="ghost">Back to Dashboard</Button></Link>
      </div>
    );
  }

  const persona = account.persona as { tone?: string; vibe?: string } | null;
  const audience = account.audience as { who?: string; pain_points?: string[] } | null;

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
                  <h1 className="text-xl font-semibold">{account.account_name || account.account_id}</h1>
                  <Badge className={cn("platform-badge", account.platform)}>
                    {account.platform === "tiktok" ? "TikTok" : account.platform === "instagram" ? "Instagram" : "YT Shorts"}
                  </Badge>
                  <StatusBadge status={account.status} />
                  <MonetizationBadge mode={account.monetization_mode} />
                </div>
                <p className="text-sm text-muted-foreground">{account.handle || `@${account.account_id}`}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
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
                  <><Pause className="w-4 h-4" />Pause</>
                ) : (
                  <><Play className="w-4 h-4" />Resume</>
                )}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <MetricCard label="Vertical" value={account.vertical} icon={<Target className="w-4 h-4" />} />
          <MetricCard label="Priority" value={`${account.priority_score}`} icon={<Zap className="w-4 h-4" />} />
          <MetricCard label="Posts/Day Target" value={`${account.posting_frequency_target}`} icon={<Video className="w-4 h-4" />} />
          <MetricCard label="Max Daily Posts" value={`${account.max_daily_posts}`} icon={<Activity className="w-4 h-4" />} />
          <MetricCard label="Monetization" value={account.monetization_mode.replace("_", " ")} icon={<DollarSign className="w-4 h-4" />} />
          <MetricCard label="Products" value={`${account.allowed_product_categories?.length || 0} cats`} icon={<Package className="w-4 h-4" />} />
        </div>

        {/* Promise */}
        <div className="glass-card p-6">
          <h3 className="text-lg font-semibold mb-2">Account Promise</h3>
          <p className="text-muted-foreground italic">"{account.promise}"</p>
          {account.content_style && (
            <p className="text-sm text-muted-foreground mt-2">Style: {account.content_style}</p>
          )}
        </div>

        <Tabs defaultValue="strategy" className="space-y-6">
          <TabsList className="bg-secondary/30">
            <TabsTrigger value="strategy">Strategy</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="pillars">Content Pillars</TabsTrigger>
          </TabsList>

          <TabsContent value="strategy" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Persona */}
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <Palette className="w-4 h-4" />
                  <span className="text-sm font-medium">Persona</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tone</span>
                    <span className="font-medium">{persona?.tone || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vibe</span>
                    <span className="font-medium">{persona?.vibe || "—"}</span>
                  </div>
                </div>
              </div>

              {/* Audience */}
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <Target className="w-4 h-4" />
                  <span className="text-sm font-medium">Audience</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Who</span>
                    <span className="font-medium text-right max-w-[200px]">{audience?.who || "—"}</span>
                  </div>
                  {audience?.pain_points && audience.pain_points.length > 0 && (
                    <div>
                      <span className="text-muted-foreground text-xs">Pain points:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {audience.pain_points.map((p, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{p}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Product Eligibility */}
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <Package className="w-4 h-4" />
                  <span className="text-sm font-medium">Product Eligibility</span>
                </div>
                {account.allowed_product_categories && account.allowed_product_categories.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {account.allowed_product_categories.map(cat => (
                      <Badge key={cat} variant="outline" className="text-xs">{cat}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No product categories (app-only)</p>
                )}
              </div>

              {/* Voice */}
              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-4 text-muted-foreground">
                  <Mic className="w-4 h-4" />
                  <span className="text-sm font-medium">Voice</span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Voice ID</span>
                    <span className="font-medium">{account.voice_id || "Default"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Provider</span>
                    <span className="font-medium">{account.voice_provider || "ElevenLabs"}</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="config" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ConfigSection
                title="Posting Schedule"
                icon={<Calendar className="w-4 h-4" />}
                items={[
                  { label: "Frequency Target", value: `${account.posting_frequency_target}x daily` },
                  { label: "Max Daily Posts", value: `${account.max_daily_posts}` },
                ]}
              />
              <ConfigSection
                title="Safety"
                icon={<Shield className="w-4 h-4" />}
                items={[
                  { label: "Claim Policy", value: account.claim_policy },
                  { label: "CTA Style", value: account.cta_style },
                ]}
              />
            </div>
          </TabsContent>

          <TabsContent value="pillars" className="space-y-4">
            <div className="glass-card p-6">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Content Pillars</h3>
              <div className="flex flex-wrap gap-2">
                {account.content_pillars?.map((pillar, i) => (
                  <Badge key={i} variant="secondary" className="text-sm">{pillar}</Badge>
                ))}
                {(!account.content_pillars || account.content_pillars.length === 0) && (
                  <p className="text-sm text-muted-foreground">No pillars configured</p>
                )}
              </div>
              {account.banned_topics && account.banned_topics.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Banned Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {account.banned_topics.map((topic, i) => (
                      <Badge key={i} variant="destructive" className="text-xs">{topic}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; class: string }> = {
    active: { label: "Active", class: "bg-success/10 text-success border-success/30" },
    paused: { label: "Paused", class: "bg-muted text-muted-foreground border-border" },
    warmup: { label: "Warmup", class: "bg-warning/10 text-warning border-warning/30" },
    flagged: { label: "Flagged", class: "bg-destructive/10 text-destructive border-destructive/30" },
  };
  const c = config[status] || config.active;
  return <Badge variant="outline" className={c.class}>{c.label}</Badge>;
}

function MonetizationBadge({ mode }: { mode: string }) {
  const config: Record<string, { label: string; class: string }> = {
    app_first: { label: "📱 App-First", class: "bg-primary/10 text-primary border-primary/30" },
    product_first: { label: "📦 Product-First", class: "bg-warning/10 text-warning border-warning/30" },
    hybrid: { label: "🔄 Hybrid", class: "bg-accent/10 text-accent-foreground border-accent/30" },
  };
  const c = config[mode] || config.app_first;
  return <Badge variant="outline" className={c.class}>{c.label}</Badge>;
}

function MetricCard({ label, value, icon }: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2 mb-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-xl font-semibold font-mono capitalize">{value}</p>
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
            <span className="text-sm font-medium capitalize">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
