import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, TrendingUp, Package, Search, Loader2, Sparkles, ChevronDown, ChevronUp, Lightbulb, Film, Users } from "lucide-react";
import { type ProductWithAnalysis, type ProductStatus, useUpdateProductStatus, useResearchProduct, useGenerateProductPlan, useProductLinkedIdeas, useAssignProductAccounts } from "@/hooks/use-products";
import { ProductScoringForm } from "./ProductScoringForm";
import { ProductMarketingPlan } from "./ProductMarketingPlan";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STATUS_COLORS: Record<ProductStatus, string> = {
  discovered: "bg-blue-500/10 text-blue-500",
  researching: "bg-yellow-500/10 text-yellow-500",
  approved: "bg-green-500/10 text-green-500",
  active: "bg-primary/10 text-primary",
  paused: "bg-muted text-muted-foreground",
  dead: "bg-destructive/10 text-destructive",
};

const NEXT_STATUS: Partial<Record<ProductStatus, ProductStatus>> = {
  discovered: "researching",
  researching: "approved",
  approved: "active",
};

export function ProductDetailCard({ product }: { product: ProductWithAnalysis }) {
  const [showPlan, setShowPlan] = useState(false);
  const analysis = product.product_analysis?.[0];
  const updateStatus = useUpdateProductStatus();
  const researchProduct = useResearchProduct();
  const generatePlan = useGenerateProductPlan();
  const { data: linkedIdeas } = useProductLinkedIdeas(product.id);

  const priceDollars = product.price_cents ? (product.price_cents / 100).toFixed(2) : null;
  const costDollars = product.supplier_price_cents ? (product.supplier_price_cents / 100).toFixed(2) : null;
  const margin = product.estimated_margin_pct;
  const next = NEXT_STATUS[product.status];
  const hasPlan = product.plan_status === "ready" && product.marketing_plan;
  const isGenerating = product.plan_status === "generating" || generatePlan.isPending;

  return (
    <Card className="group hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {product.image_url ? (
              <img src={product.image_url} alt={product.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
            ) : (
              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <CardTitle className="text-sm truncate">{product.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {linkedIdeas && linkedIdeas.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                <Lightbulb className="w-3 h-3 mr-0.5" />
                {linkedIdeas.length}
              </Badge>
            )}
            <Badge className={`${STATUS_COLORS[product.status]} text-xs`} variant="outline">
              {product.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Price row */}
        <div className="flex items-center gap-3 text-xs">
          {priceDollars && <span className="font-medium">${priceDollars}</span>}
          {costDollars && <span className="text-muted-foreground">Cost: ${costDollars}</span>}
          {margin != null && (
            <span className={margin >= 50 ? "text-green-500 font-medium" : "text-muted-foreground"}>
              {margin}% margin
            </span>
          )}
        </div>

        {/* Analysis scores */}
        {analysis && (
          <div className="flex flex-wrap gap-1">
            {analysis.wow_factor && <Badge variant="secondary" className="text-xs">Wow {analysis.wow_factor}/5</Badge>}
            {analysis.social_media_potential && <Badge variant="secondary" className="text-xs">Social {analysis.social_media_potential}/5</Badge>}
            {analysis.impulse_buy_appeal && <Badge variant="secondary" className="text-xs">Impulse {analysis.impulse_buy_appeal}/5</Badge>}
            {analysis.demonstrability_score && <Badge variant="secondary" className="text-xs">Demo {analysis.demonstrability_score}/5</Badge>}
            {analysis.overall_score != null && (
              <Badge variant={analysis.overall_score >= 70 ? "default" : "outline"} className="text-xs">
                Score: {analysis.overall_score}
              </Badge>
            )}
            {analysis.trending_status && (
              <Badge variant="outline" className="text-xs">
                <TrendingUp className="w-3 h-3 mr-0.5" />
                {analysis.trending_status}
              </Badge>
            )}
          </div>
        )}

        {product.category && <p className="text-xs text-muted-foreground">{product.category}{product.subcategory ? ` / ${product.subcategory}` : ""}</p>}
        {product.notes && <p className="text-xs text-muted-foreground line-clamp-2">{product.notes}</p>}

        {/* Plan version indicator */}
        {hasPlan && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between text-xs h-7"
            onClick={() => setShowPlan(!showPlan)}
          >
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Marketing Plan v{product.plan_version}
            </span>
            {showPlan ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
        )}

        {showPlan && hasPlan && (
          <ProductMarketingPlan plan={product.marketing_plan} />
        )}

        {/* Linked Ideas */}
        {linkedIdeas && linkedIdeas.length > 0 && showPlan && (
          <div className="border-t pt-2 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Linked Ideas</p>
            {linkedIdeas.map((idea) => (
              <div key={idea.id} className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Badge variant="outline" className="text-[10px] shrink-0">{idea.status}</Badge>
                  <span className="truncate">{idea.title}</span>
                </div>
                {idea.status === "approved" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1 shrink-0"
                    onClick={async () => {
                      try {
                        // Build a proper storyboard from product + idea context
                        const plan = product.marketing_plan as any;
                        const hookType = plan?.marketing_plan?.best_hook_type || "visual_reveal";
                        const first3s = plan?.marketing_plan?.best_first_3_seconds || `Show ${product.name} in action`;
                        const angles = plan?.marketing_plan?.winning_angles || [];
                        const angleDesc = angles[0]?.demo_concept || idea.angle || "product demo";

                        const scenes = [
                          { id: crypto.randomUUID(), prompt: `${first3s}. Hook type: ${hookType}. Product: ${product.name}`, sequence_index: 0, duration_target: 3 },
                          { id: crypto.randomUUID(), prompt: `Demonstrate ${product.name}: ${angleDesc}. Show the product being used, close-up detail shot.`, sequence_index: 1, duration_target: 5 },
                          { id: crypto.randomUUID(), prompt: `Show the transformation or result of using ${product.name}. Before/after or reaction shot.`, sequence_index: 2, duration_target: 4 },
                          { id: crypto.randomUUID(), prompt: `Final shot of ${product.name} with text overlay for call-to-action. Clean product display.`, sequence_index: 3, duration_target: 3 },
                        ];

                        const { error } = await supabase.functions.invoke("create-story", {
                          body: {
                            title: idea.title,
                            account_id: "ecommerce_default",
                            story_type: "product_demo",
                            continuity_anchors: { product_name: product.name, product_category: product.category },
                            storyboard_json: { scenes },
                            content_idea_id: idea.id,
                            auto_generate: true,
                          },
                        });
                        if (error) throw error;
                        toast.success("Story created with product demo storyboard");
                      } catch (e: any) {
                        toast.error(`Story creation failed: ${e.message}`);
                      }
                    }}
                  >
                    <Film className="w-3 h-3" /> Story
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => researchProduct.mutate({ product_id: product.id })}
            disabled={researchProduct.isPending}
          >
            {researchProduct.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Search className="w-3 h-3 mr-1" />}
            AI Research
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => generatePlan.mutate(product.id)}
            disabled={isGenerating}
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
            {hasPlan ? "Regen Plan" : "Gen Plan"}
          </Button>
          <ProductScoringForm product={product} />
          {next && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateStatus.mutate({ id: product.id, status: next })}
              disabled={updateStatus.isPending}
            >
              → {next}
            </Button>
          )}
          {product.source_url && (
            <a href={product.source_url} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm"><ExternalLink className="w-3 h-3" /></Button>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
