/**
 * Command Center — The brain layer
 * 
 * Answers: "What should I do right now?"
 * Shows actionable priorities, top products, and key stats.
 */
import { useNavigate } from "react-router-dom";
import { GlobalNav } from "@/components/GlobalNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCommandCenter } from "@/hooks/use-command-center";
import {
  Package,
  Lightbulb,
  Film,
  Sparkles,
  TrendingUp,
  Search,
  CheckCircle,
  ShoppingBag,
  ArrowRight,
  Flame,
  Eye,
  Clock,
  Zap,
} from "lucide-react";

const ACTION_ICONS: Record<string, typeof Package> = {
  product_approve: CheckCircle,
  product_research: Search,
  idea_approve: Lightbulb,
  video_review: Film,
  plan_generate: Sparkles,
  product_hot: Flame,
  winner_scale: TrendingUp,
  loser_cut: Eye,
};

const ACTION_COLORS: Record<string, string> = {
  product_approve: "border-l-green-500",
  product_research: "border-l-blue-500",
  idea_approve: "border-l-yellow-500",
  video_review: "border-l-purple-500",
  plan_generate: "border-l-orange-500",
  product_hot: "border-l-red-500",
  winner_scale: "border-l-emerald-500",
  loser_cut: "border-l-gray-500",
};

const ACTION_ROUTES: Record<string, string> = {
  product_approve: "/products",
  product_research: "/products",
  idea_approve: "/ideas",
  video_review: "/review",
  plan_generate: "/products",
  product_hot: "/products",
  winner_scale: "/review",
  loser_cut: "/review",
};

const TREND_COLORS: Record<string, string> = {
  emerging: "text-blue-500",
  rising: "text-green-500",
  peak: "text-orange-500",
  declining: "text-muted-foreground",
  saturated: "text-destructive",
};

const Index = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useCommandCenter();

  const actions = data?.actions || [];
  const stats = data?.stats;
  const topProducts = data?.topProducts || [];

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />

      <main className="container mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Command Center</h1>
            <p className="text-sm text-muted-foreground">What needs your attention right now</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => navigate("/ideas")} className="gap-2">
              <Lightbulb className="h-4 w-4" /> Ideas
            </Button>
            <Button onClick={() => navigate("/produce")} className="gap-2">
              <Zap className="h-4 w-4" /> Produce
            </Button>
          </div>
        </div>

        {/* Key Stats Bar */}
        <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {isLoading ? (
            Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
          ) : (
            <>
              <StatCard label="Discovered" value={stats?.productsDiscovered ?? 0} icon={<Package className="w-4 h-4" />} onClick={() => navigate("/products")} />
              <StatCard label="Approved" value={stats?.productsApproved ?? 0} icon={<CheckCircle className="w-4 h-4" />} onClick={() => navigate("/products")} />
              <StatCard label="Active" value={stats?.productsActive ?? 0} icon={<ShoppingBag className="w-4 h-4" />} onClick={() => navigate("/products")} />
              <StatCard label="Ideas Pending" value={stats?.ideasProposed ?? 0} icon={<Lightbulb className="w-4 h-4" />} onClick={() => navigate("/ideas")} highlight={!!stats?.ideasProposed} />
              <StatCard label="Ideas Ready" value={stats?.ideasApproved ?? 0} icon={<Sparkles className="w-4 h-4" />} onClick={() => navigate("/ideas")} />
              <StatCard label="Videos to Review" value={stats?.videosAwaitingReview ?? 0} icon={<Eye className="w-4 h-4" />} onClick={() => navigate("/review")} highlight={!!stats?.videosAwaitingReview} />
              <StatCard label="Generating" value={stats?.storiesGenerating ?? 0} icon={<Clock className="w-4 h-4" />} />
            </>
          )}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Actions — 3 cols */}
          <section className="lg:col-span-3 space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500" />
              Priority Actions
              {actions.length > 0 && (
                <Badge variant="secondary" className="text-xs">{actions.length}</Badge>
              )}
            </h2>

            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)
            ) : actions.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-500" />
                  <p className="text-sm font-medium">All caught up!</p>
                  <p className="text-xs mt-1">No urgent actions right now. Discover products or generate ideas.</p>
                </CardContent>
              </Card>
            ) : (
              actions.slice(0, 8).map((action) => {
                const Icon = ACTION_ICONS[action.type] || Package;
                return (
                  <Card
                    key={action.id}
                    className={`border-l-4 ${ACTION_COLORS[action.type] || ""} cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => navigate(ACTION_ROUTES[action.type] || "/")}
                  >
                    <CardContent className="py-3 px-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className="w-5 h-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{action.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{action.subtitle}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                );
              })
            )}
          </section>

          {/* Top Products — 2 cols */}
          <section className="lg:col-span-2 space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Top Products
            </h2>

            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
            ) : topProducts.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Package className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No products yet</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate("/products")}>
                    Discover Products
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {topProducts.map((product, idx) => (
                  <Card
                    key={product.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => navigate("/products")}
                  >
                    <CardContent className="py-2.5 px-3 flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-5 text-center shrink-0">
                        {idx + 1}
                      </span>
                      {product.image_url ? (
                        <img src={product.image_url} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{product.name}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={product.score >= 70 ? "default" : "outline"} className="text-[10px] h-4">
                            {product.score}
                          </Badge>
                          {product.trending_status && (
                            <span className={TREND_COLORS[product.trending_status] || ""}>
                              {product.trending_status}
                            </span>
                          )}
                          {product.margin != null && (
                            <span>{product.margin}%</span>
                          )}
                          {product.has_plan && <Sparkles className="w-3 h-3 text-orange-400" />}
                          {product.linked_ideas > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Lightbulb className="w-3 h-3" /> {product.linked_ideas}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">{product.status}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

function StatCard({ label, value, icon, onClick, highlight }: { 
  label: string; 
  value: number; 
  icon: React.ReactNode; 
  onClick?: () => void;
  highlight?: boolean;
}) {
  return (
    <Card
      className={`cursor-pointer hover:shadow-sm transition-shadow ${highlight ? "ring-1 ring-primary/30" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-3 flex flex-col items-center text-center gap-1">
        <div className="text-muted-foreground">{icon}</div>
        <p className={`text-xl font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
      </CardContent>
    </Card>
  );
}

export default Index;
