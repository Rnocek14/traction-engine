/**
 * Verticals — The network at a glance
 * 
 * Shows all marketing verticals with account counts, content stats,
 * and monetization modes. This is the operator's home page.
 */
import { useNavigate } from "react-router-dom";
import { GlobalNav } from "@/components/GlobalNav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useVerticals } from "@/hooks/use-verticals";
import {
  Shield, Heart, GraduationCap, Cpu, Home, Baby,
  Users, Film, Lightbulb, Sparkles, ArrowRight,
  ShoppingBag, AppWindow, TrendingUp,
} from "lucide-react";

const VERTICAL_META: Record<string, { icon: typeof Shield; color: string; label: string; description: string }> = {
  privacy: { icon: Shield, color: "from-blue-600 to-blue-400", label: "Privacy & Security", description: "Digital safety, VPN, data protection" },
  health: { icon: Heart, color: "from-rose-600 to-rose-400", label: "Health & Recovery", description: "Brain health, stroke recovery, wellness" },
  education: { icon: GraduationCap, color: "from-amber-600 to-amber-400", label: "Education & Career", description: "Career growth, resume building, skills" },
  gadgets: { icon: Cpu, color: "from-violet-600 to-violet-400", label: "Gadgets & Tech", description: "Cool finds, smart home, under $50" },
  home: { icon: Home, color: "from-emerald-600 to-emerald-400", label: "Home & Living", description: "Home glow-ups, tiny upgrades, decor" },
  toys: { icon: Baby, color: "from-pink-600 to-pink-400", label: "Toys & Satisfying", description: "Oddly satisfying, parent-approved finds" },
};

const PLATFORM_ICONS: Record<string, string> = {
  tiktok: "TT",
  instagram: "IG",
  youtube: "YT",
};

export default function Verticals() {
  const navigate = useNavigate();
  const { data: verticals = [], isLoading } = useVerticals();

  const totalAccounts = verticals.reduce((sum, v) => sum + v.accounts.length, 0);
  const totalContent = verticals.reduce((sum, v) => sum + v.stats.totalContent, 0);
  const totalAssembled = verticals.reduce((sum, v) => sum + v.stats.assembled, 0);

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />

      <main className="container mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Marketing Network</h1>
            <p className="text-sm text-muted-foreground">
              {totalAccounts} accounts · {totalContent} content pieces · {totalAssembled} assembled
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/products")} className="gap-2">
              <ShoppingBag className="h-4 w-4" /> Products
            </Button>
            <Button onClick={() => navigate("/studio")} className="gap-2">
              <Film className="h-4 w-4" /> Studio
            </Button>
          </div>
        </div>

        {/* Network Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat label="Verticals" value={verticals.length} icon={<TrendingUp className="w-4 h-4" />} />
          <MiniStat label="Accounts" value={totalAccounts} icon={<Users className="w-4 h-4" />} />
          <MiniStat label="Videos Ready" value={totalAssembled} icon={<Film className="w-4 h-4" />} />
          <MiniStat label="Ideas in Queue" value={verticals.reduce((s, v) => s + v.stats.ideas, 0)} icon={<Lightbulb className="w-4 h-4" />} />
        </div>

        {/* Vertical Cards Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {verticals.map(v => {
              const meta = VERTICAL_META[v.vertical] || {
                icon: Sparkles,
                color: "from-gray-600 to-gray-400",
                label: v.vertical,
                description: "",
              };
              const Icon = meta.icon;

              return (
                <Card
                  key={v.vertical}
                  className="cursor-pointer hover:shadow-lg transition-all hover:-translate-y-0.5 overflow-hidden"
                  onClick={() => navigate(`/verticals/${v.vertical}`)}
                >
                  {/* Color header */}
                  <div className={`h-2 bg-gradient-to-r ${meta.color}`} />
                  
                  <CardContent className="p-4 space-y-3">
                    {/* Title row */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${meta.color} flex items-center justify-center`}>
                          <Icon className="w-4.5 h-4.5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm">{meta.label}</h3>
                          <p className="text-xs text-muted-foreground">{meta.description}</p>
                        </div>
                      </div>
                      <Badge
                        variant={v.monetization_mode === "product_first" ? "default" : "secondary"}
                        className="text-[10px] shrink-0"
                      >
                        {v.monetization_mode === "product_first" ? "Product" : v.monetization_mode === "app_first" ? "App" : "Mixed"}
                      </Badge>
                    </div>

                    {/* Accounts */}
                    <div className="flex flex-wrap gap-1.5">
                      {v.accounts.map(a => (
                        <div
                          key={a.account_id}
                          className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs"
                        >
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {PLATFORM_ICONS[a.platform] || a.platform}
                          </span>
                          <span className="truncate max-w-[120px]">
                            {a.account_name || a.account_id}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1 border-t">
                      <span className="flex items-center gap-1">
                        <Film className="w-3 h-3" /> {v.stats.assembled} videos
                      </span>
                      <span className="flex items-center gap-1">
                        <Lightbulb className="w-3 h-3" /> {v.stats.ideas} ideas
                      </span>
                      {v.stats.generating > 0 && (
                        <span className="flex items-center gap-1 text-primary">
                          <Sparkles className="w-3 h-3" /> {v.stats.generating} rendering
                        </span>
                      )}
                      <ArrowRight className="w-3 h-3 ml-auto" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          <p className="text-lg font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
