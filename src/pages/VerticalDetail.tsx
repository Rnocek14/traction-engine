/**
 * VerticalDetail — Single vertical workspace
 * 
 * Shows accounts, content queue, assigned products, and apps for one vertical.
 */
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { GlobalNav } from "@/components/GlobalNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Film, Lightbulb, Users, ShoppingBag,
  AppWindow, Sparkles, CheckCircle, Clock, Eye,
} from "lucide-react";

export default function VerticalDetail() {
  const { vertical } = useParams<{ vertical: string }>();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["vertical-detail", vertical],
    queryFn: async () => {
      const [accountsRes, storiesRes, ideasRes, productsRes] = await Promise.all([
        supabase.from("account_configs").select("*").eq("vertical", vertical! as any).eq("status", "active"),
        supabase.from("story_jobs").select("id, title, status, assembled_status, review_status, account_id, product_id, created_at, assembled_video_url")
          .order("created_at", { ascending: false }).limit(100),
        supabase.from("content_ideas").select("id, title, status, account_id, opportunity_score, angle, suggested_format, product_id, content_type")
          .order("created_at", { ascending: false }).limit(200),
        supabase.from("products").select("id, name, image_url, status, price_cents, estimated_margin_pct").neq("status", "dead"),
      ]);

      const accounts = accountsRes.data || [];
      const accountIds = new Set(accounts.map(a => a.account_id));

      const stories = (storiesRes.data || []).filter(s => accountIds.has(s.account_id));
      const ideas = (ideasRes.data || []).filter(i => accountIds.has(i.account_id));

      return { accounts, stories, ideas, products: productsRes.data || [] };
    },
    enabled: !!vertical,
  });

  const accounts = data?.accounts || [];
  const stories = data?.stories || [];
  const ideas = data?.ideas || [];
  const products = data?.products || [];

  const assembled = stories.filter(s => s.assembled_status === "succeeded");
  const generating = stories.filter(s => s.status === "generating");
  const pendingReview = stories.filter(s => s.assembled_status === "succeeded" && s.review_status === "pending");
  const proposedIdeas = ideas.filter(i => i.status === "proposed");

  const verticalLabel = vertical ? vertical.charAt(0).toUpperCase() + vertical.slice(1) : "";

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />

      <main className="container mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{verticalLabel} Vertical</h1>
            <p className="text-sm text-muted-foreground">
              {accounts.length} accounts · {assembled.length} videos · {proposedIdeas.length} ideas pending
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard icon={<Users className="w-4 h-4" />} label="Accounts" value={accounts.length} />
          <StatCard icon={<Film className="w-4 h-4" />} label="Videos" value={assembled.length} />
          <StatCard icon={<Clock className="w-4 h-4" />} label="Generating" value={generating.length} highlight={generating.length > 0} />
          <StatCard icon={<Eye className="w-4 h-4" />} label="Needs Review" value={pendingReview.length} highlight={pendingReview.length > 0} />
          <StatCard icon={<Lightbulb className="w-4 h-4" />} label="Ideas" value={proposedIdeas.length} />
        </div>

        <Tabs defaultValue="accounts">
          <TabsList>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="content">Content ({stories.length})</TabsTrigger>
            <TabsTrigger value="ideas">Ideas ({ideas.length})</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
          </TabsList>

          {/* Accounts Tab */}
          <TabsContent value="accounts" className="mt-4">
            {isLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {accounts.map(a => (
                  <Card key={a.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/account/${a.account_id}`)}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{a.account_name || a.account_id}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px]">{a.platform}</Badge>
                          <Badge variant="secondary" className="text-[10px]">{a.monetization_mode}</Badge>
                          {a.handle && <span className="text-xs text-muted-foreground">@{a.handle}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{a.promise}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p>{stories.filter(s => s.account_id === a.account_id).length} stories</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Content Tab */}
          <TabsContent value="content" className="mt-4">
            {stories.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                <Film className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No content created yet for this vertical</p>
              </CardContent></Card>
            ) : (
              <div className="space-y-2">
                {stories.slice(0, 20).map(s => (
                  <Card key={s.id} className="cursor-pointer hover:shadow-sm transition-shadow" onClick={() => navigate(`/studio`)}>
                    <CardContent className="py-2.5 px-4 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.title || "Untitled"}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={s.assembled_status === "succeeded" ? "default" : "outline"} className="text-[10px]">
                            {s.assembled_status || s.status}
                          </Badge>
                          {s.review_status && (
                            <Badge variant={s.review_status === "approved" ? "default" : "secondary"} className="text-[10px]">
                              {s.review_status}
                            </Badge>
                          )}
                          {s.product_id && <ShoppingBag className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {new Date(s.created_at).toLocaleDateString()}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Ideas Tab */}
          <TabsContent value="ideas" className="mt-4">
            {ideas.length === 0 ? (
              <Card><CardContent className="py-8 text-center text-muted-foreground">
                <Lightbulb className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">No ideas for this vertical yet</p>
              </CardContent></Card>
            ) : (
              <div className="space-y-2">
                {ideas.slice(0, 20).map(i => (
                  <Card key={i.id}>
                    <CardContent className="py-2.5 px-4 flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{i.title}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={i.status === "proposed" ? "secondary" : "default"} className="text-[10px]">
                            {i.status}
                          </Badge>
                          {i.opportunity_score != null && (
                            <span className="text-xs text-muted-foreground">Score: {i.opportunity_score}</span>
                          )}
                          {i.product_id && <ShoppingBag className="w-3 h-3 text-muted-foreground" />}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {products.slice(0, 12).map(p => (
                <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/products/${p.id}`)}>
                  <CardContent className="p-3 flex items-center gap-3">
                    {p.image_url ? (
                      <img src={p.image_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shrink-0">
                        <ShoppingBag className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                        {p.price_cents && <span>${(p.price_cents / 100).toFixed(2)}</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "ring-1 ring-primary/30" : ""}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className="text-muted-foreground">{icon}</div>
        <div>
          <p className={`text-lg font-bold ${highlight ? "text-primary" : ""}`}>{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
