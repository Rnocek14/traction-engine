import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, TrendingUp, Package } from "lucide-react";
import { type ProductWithAnalysis, type ProductStatus, useUpdateProductStatus, useResearchProduct } from "@/hooks/use-products";
import { ProductScoringForm } from "./ProductScoringForm";
import { Search, Loader2 } from "lucide-react";

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
  const analysis = product.product_analysis?.[0];
  const updateStatus = useUpdateProductStatus();
  const researchProduct = useResearchProduct();

  const priceDollars = product.price_cents ? (product.price_cents / 100).toFixed(2) : null;
  const costDollars = product.supplier_price_cents ? (product.supplier_price_cents / 100).toFixed(2) : null;
  const margin = product.estimated_margin_pct;
  const next = NEXT_STATUS[product.status];

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
          <Badge className={`${STATUS_COLORS[product.status]} text-xs flex-shrink-0`} variant="outline">
            {product.status}
          </Badge>
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
