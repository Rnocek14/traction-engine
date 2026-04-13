import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, TrendingUp, Package, Search, Loader2, Sparkles, ChevronDown, ChevronUp, Lightbulb, Film, Users, ImageIcon, ChevronLeft, ChevronRight, Trash2, CheckCircle2, ShoppingCart, Warehouse, DollarSign, Truck, Star, Calculator, AlertTriangle } from "lucide-react";
import { type ProductWithAnalysis, type ProductStatus, useUpdateProductStatus, useResearchProduct, useGenerateProductPlan, useProductLinkedIdeas, useAssignProductAccounts } from "@/hooks/use-products";
import { ProductScoringForm } from "./ProductScoringForm";
import { ProductMarketingPlan } from "./ProductMarketingPlan";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

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
  const [showSuppliers, setShowSuppliers] = useState(false);
  const [showEconomics, setShowEconomics] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [calcPending, setCalcPending] = useState(false);
  const analysis = product.product_analysis?.[0];
  const images = product.product_images || [];
  const links = product.product_links || [];
  const suppliers = product.product_suppliers || [];
  const economics = product.product_unit_economics?.[0] || null;
  const retailLinks = links.filter(l => l.link_type === "retail");
  const wholesaleLinks = links.filter(l => l.link_type === "wholesale");
  const updateStatus = useUpdateProductStatus();
  const researchProduct = useResearchProduct();
  const generatePlan = useGenerateProductPlan();
  const assignAccounts = useAssignProductAccounts();
  const { data: linkedIdeas } = useProductLinkedIdeas(product.id);
  const qc = useQueryClient();

  const handleRecalcEconomics = async () => {
    setCalcPending(true);
    try {
      const { error } = await supabase.functions.invoke("calculate-unit-economics", {
        body: { product_id: product.id },
      });
      if (error) throw error;
      toast.success("Economics recalculated");
      qc.invalidateQueries({ queryKey: ["products"] });
    } catch (e: any) {
      toast.error(`Calc failed: ${e.message}`);
    } finally {
      setCalcPending(false);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    const { error } = await supabase.from("product_images").delete().eq("id", imageId);
    if (error) { toast.error("Failed to delete image"); return; }
    toast.success("Image removed");
    qc.invalidateQueries({ queryKey: ["products"] });
    setImgIdx(0);
  };

  const handleVerifyImage = async (imageId: string) => {
    const { error } = await supabase.from("product_images").update({ verified: true }).eq("id", imageId);
    if (error) { toast.error("Failed to verify"); return; }
    toast.success("Image verified ✓");
    qc.invalidateQueries({ queryKey: ["products"] });
  };

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
            {images.length > 0 ? (
              <div className="relative w-10 h-10 flex-shrink-0">
                <img
                  src={images[0]?.url}
                  alt={product.name}
                  className="w-10 h-10 rounded object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            ) : product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-10 h-10 rounded object-cover flex-shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center flex-shrink-0">
                <Package className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <CardTitle className="text-sm truncate">{product.name}</CardTitle>
              {images.length > 0 && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                  <ImageIcon className="w-2.5 h-2.5" /> {images.length} photos
                </span>
              )}
            </div>
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
        {/* Image gallery */}
        {images.length > 0 && (
          <div className="relative rounded-md overflow-hidden bg-muted/30">
            <img
              src={images[imgIdx]?.url}
              alt={`${product.name} - ${images[imgIdx]?.label}`}
              className="w-full h-32 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
            />
            {/* Top-left: verify/delete controls */}
            <div className="absolute top-1 left-1 flex items-center gap-0.5">
              {!images[imgIdx]?.verified && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-5 w-5 p-0 rounded-full opacity-80 hover:opacity-100 hover:bg-green-500/20"
                  onClick={() => handleVerifyImage(images[imgIdx].id)}
                  title="Verify — this is the correct product"
                >
                  <CheckCircle2 className="w-3 h-3 text-green-500" />
                </Button>
              )}
              {images[imgIdx]?.verified && (
                <Badge className="text-[9px] bg-green-500/20 text-green-500 border-green-500/30">✓ verified</Badge>
              )}
              <Button
                variant="secondary"
                size="sm"
                className="h-5 w-5 p-0 rounded-full opacity-80 hover:opacity-100 hover:bg-destructive/20"
                onClick={() => handleDeleteImage(images[imgIdx].id)}
                title="Remove — wrong image"
              >
                <Trash2 className="w-3 h-3 text-destructive" />
              </Button>
            </div>
            {/* Bottom nav */}
            {images.length > 1 && (
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-5 w-5 p-0 rounded-full opacity-80"
                  onClick={() => setImgIdx((imgIdx - 1 + images.length) % images.length)}
                >
                  <ChevronLeft className="w-3 h-3" />
                </Button>
                <span className="text-[10px] bg-background/80 px-1.5 rounded-full">
                  {imgIdx + 1}/{images.length}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-5 w-5 p-0 rounded-full opacity-80"
                  onClick={() => setImgIdx((imgIdx + 1) % images.length)}
                >
                  <ChevronRight className="w-3 h-3" />
                </Button>
              </div>
            )}
            <Badge variant="outline" className="absolute top-1 right-1 text-[9px] bg-background/80">
              {images[imgIdx]?.source} · {images[imgIdx]?.label}
            </Badge>
          </div>
        )}

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

        {/* Verified Links */}
        {(retailLinks.length > 0 || wholesaleLinks.length > 0) && (
          <div className="space-y-1.5 border-t pt-2">
            {retailLinks.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 mb-1">
                  <ShoppingCart className="w-3 h-3" /> Where to Buy ({retailLinks.length})
                </p>
                {retailLinks.map(link => (
                  <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1 mb-0.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge variant="outline" className="text-[10px] shrink-0">{link.platform}</Badge>
                      {link.verified && <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />}
                      <span className="truncate text-muted-foreground">{link.title?.slice(0, 40) || link.url.slice(0, 40)}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {link.price_cents && <span className="font-medium">${(link.price_cents / 100).toFixed(2)}</span>}
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </a>
                ))}
              </div>
            )}
            {wholesaleLinks.length > 0 && (
              <div>
                <p className="text-[10px] font-medium text-muted-foreground flex items-center gap-1 mb-1">
                  <Warehouse className="w-3 h-3" /> Wholesale Sources ({wholesaleLinks.length})
                </p>
                {wholesaleLinks.map(link => (
                  <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between text-xs bg-muted/30 rounded px-2 py-1 mb-0.5 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Badge variant="outline" className="text-[10px] shrink-0">{link.platform}</Badge>
                      {link.verified && <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />}
                      <span className="truncate text-muted-foreground">{link.title?.slice(0, 40) || "View listing"}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {link.price_cents && <span className="font-medium">${(link.price_cents / 100).toFixed(2)}</span>}
                      <ExternalLink className="w-3 h-3 text-muted-foreground" />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Supplier Intelligence */}
        {suppliers.length > 0 && (
          <div className="border-t pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-xs h-7"
              onClick={() => setShowSuppliers(!showSuppliers)}
            >
              <span className="flex items-center gap-1">
                <Truck className="w-3 h-3" />
                Suppliers ({suppliers.length})
                {suppliers.find(s => s.is_preferred) && (
                  <Badge variant="outline" className="text-[9px] ml-1">preferred set</Badge>
                )}
              </span>
              {showSuppliers ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
            {showSuppliers && (
              <div className="space-y-1.5 mt-1">
                {suppliers
                  .sort((a, b) => (b.is_preferred ? 1 : 0) - (a.is_preferred ? 1 : 0))
                  .map(s => (
                  <div key={s.id} className={`text-xs rounded px-2 py-1.5 space-y-0.5 ${s.is_preferred ? "bg-primary/5 border border-primary/20" : "bg-muted/30"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">{s.platform}</Badge>
                        <span className="font-medium">{s.supplier_name}</span>
                        {s.is_preferred && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                      </div>
                      <Badge variant="outline" className={`text-[9px] ${
                        s.verification_status === "verified" ? "text-green-500 border-green-500/30" :
                        s.verification_status === "partially_verified" ? "text-yellow-500 border-yellow-500/30" :
                        "text-muted-foreground"
                      }`}>
                        {s.verification_status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-muted-foreground">
                      {s.unit_cost_cents && <span>Unit: <span className="text-foreground font-medium">${(s.unit_cost_cents / 100).toFixed(2)}</span></span>}
                      {s.shipping_cost_cents != null && <span>Ship: ${(s.shipping_cost_cents / 100).toFixed(2)}</span>}
                      {s.delivery_days && <span>{s.processing_days ? `${s.processing_days}+` : ""}{s.delivery_days}d</span>}
                      {s.moq && s.moq > 1 && <span>MOQ: {s.moq}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {s.reliability_score && <span>Reliability: {s.reliability_score}/5</span>}
                      {s.defect_risk && <span>Defect: {s.defect_risk}/5</span>}
                      <Badge variant="outline" className={`text-[9px] ${
                        s.stock_status === "in_stock" ? "text-green-500" :
                        s.stock_status === "low_stock" ? "text-yellow-500" :
                        s.stock_status === "out_of_stock" ? "text-destructive" : ""
                      }`}>{s.stock_status}</Badge>
                    </div>
                    {s.supplier_url && (
                      <a href={s.supplier_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-0.5">
                        View listing <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Unit Economics */}
        {economics ? (
          <div className="border-t pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-xs h-7"
              onClick={() => setShowEconomics(!showEconomics)}
            >
              <span className="flex items-center gap-1">
                <DollarSign className="w-3 h-3" />
                Economics
                <Badge variant="outline" className={`text-[10px] font-bold ${
                  economics.viability_grade === "A" ? "text-green-500 border-green-500/30" :
                  economics.viability_grade === "B" ? "text-blue-500 border-blue-500/30" :
                  economics.viability_grade === "C" ? "text-yellow-500 border-yellow-500/30" :
                  economics.viability_grade === "D" ? "text-orange-500 border-orange-500/30" :
                  "text-destructive border-destructive/30"
                }`}>
                  Grade {economics.viability_grade}
                </Badge>
                {economics.net_margin_pct != null && (
                  <span className={`text-[10px] ${
                    economics.net_margin_pct >= 30 ? "text-green-500" :
                    economics.net_margin_pct >= 15 ? "text-yellow-500" :
                    "text-destructive"
                  }`}>
                    {economics.net_margin_pct}% net
                  </span>
                )}
              </span>
              {showEconomics ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </Button>
            {showEconomics && (
              <div className="text-xs space-y-1.5 mt-1 bg-muted/30 rounded p-2">
                <div className="space-y-0.5">
                  <div className="flex justify-between"><span>Retail Price</span><span className="font-medium">${(economics.retail_price_cents / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>− Supplier Cost</span><span>-${(economics.supplier_cost_cents / 100).toFixed(2)}</span></div>
                  {economics.shipping_cost_cents > 0 && <div className="flex justify-between text-muted-foreground"><span>− Shipping</span><span>-${(economics.shipping_cost_cents / 100).toFixed(2)}</span></div>}
                  {economics.packaging_cost_cents > 0 && <div className="flex justify-between text-muted-foreground"><span>− Packaging</span><span>-${(economics.packaging_cost_cents / 100).toFixed(2)}</span></div>}
                  <div className="flex justify-between border-t pt-0.5 font-medium">
                    <span>Gross Margin</span>
                    <span className={economics.gross_margin_pct && economics.gross_margin_pct >= 40 ? "text-green-500" : "text-yellow-500"}>
                      ${((economics.gross_margin_cents || 0) / 100).toFixed(2)} ({economics.gross_margin_pct}%)
                    </span>
                  </div>
                  <div className="flex justify-between text-muted-foreground"><span>− Platform Fee ({economics.platform_fee_pct}%)</span><span>-${((economics.retail_price_cents * economics.platform_fee_pct / 100) / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>− Payment Fee ({economics.payment_fee_pct}%)</span><span>-${((economics.retail_price_cents * economics.payment_fee_pct / 100) / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between text-muted-foreground"><span>− Refund Reserve ({economics.expected_return_rate_pct}%)</span><span>-${((economics.retail_price_cents * economics.expected_return_rate_pct / 100) / 100).toFixed(2)}</span></div>
                  <div className="flex justify-between border-t pt-0.5 font-bold">
                    <span>Net Margin</span>
                    <span className={economics.net_margin_pct && economics.net_margin_pct >= 20 ? "text-green-500" : economics.net_margin_pct && economics.net_margin_pct >= 0 ? "text-yellow-500" : "text-destructive"}>
                      ${((economics.net_margin_cents || 0) / 100).toFixed(2)} ({economics.net_margin_pct}%)
                    </span>
                  </div>
                </div>
                <div className="border-t pt-1 flex items-center gap-3 text-muted-foreground">
                  {economics.break_even_units && <span>BE Units: <span className="text-foreground font-medium">{economics.break_even_units}</span></span>}
                  {economics.break_even_cpa_cents && <span>Max CPA: <span className="text-foreground font-medium">${(economics.break_even_cpa_cents / 100).toFixed(2)}</span></span>}
                  {economics.break_even_roas && <span>Min ROAS: <span className="text-foreground font-medium">{economics.break_even_roas}x</span></span>}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-6 text-[10px]"
                  onClick={handleRecalcEconomics}
                  disabled={calcPending}
                >
                  {calcPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Calculator className="w-3 h-3 mr-1" />}
                  Recalculate
                </Button>
              </div>
            )}
          </div>
        ) : suppliers.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs h-7"
            onClick={handleRecalcEconomics}
            disabled={calcPending}
          >
            {calcPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Calculator className="w-3 h-3 mr-1" />}
            Calculate Unit Economics
          </Button>
        ) : null}

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
                  <Badge variant="outline" className="text-[10px] shrink-0">{idea.account_id || "unassigned"}</Badge>
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
                            account_id: idea.account_id || "ecommerce_default",
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
          {hasPlan && (product.status === "approved" || product.status === "active") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => assignAccounts.mutate(product.id)}
              disabled={assignAccounts.isPending}
            >
              {assignAccounts.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Users className="w-3 h-3 mr-1" />}
              Assign Accounts
            </Button>
          )}
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
            <a href={product.source_url.startsWith("http") ? product.source_url : `https://${product.source_url}`} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="sm"><ExternalLink className="w-3 h-3" /></Button>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
