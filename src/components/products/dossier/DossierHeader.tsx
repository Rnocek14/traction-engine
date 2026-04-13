import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Sparkles } from "lucide-react";
import { type ProductWithAnalysis, type ProductStatus, useResearchProduct, useUpdateProductStatus } from "@/hooks/use-products";

const STATUS_COLORS: Record<ProductStatus, string> = {
  discovered: "bg-blue-500/10 text-blue-500",
  researching: "bg-yellow-500/10 text-yellow-500",
  approved: "bg-green-500/10 text-green-500",
  active: "bg-primary/10 text-primary",
  paused: "bg-muted text-muted-foreground",
  dead: "bg-destructive/10 text-destructive",
};

const READINESS_LABELS: Record<string, { label: string; color: string }> = {
  research_only: { label: "Research Only", color: "text-muted-foreground" },
  review_needed: { label: "Review Needed", color: "text-yellow-500" },
  ready_to_list: { label: "Ready to List", color: "text-blue-500" },
  ready_to_test: { label: "Ready to Test", color: "text-green-500" },
  live: { label: "Live", color: "text-primary" },
  paused: { label: "Paused", color: "text-muted-foreground" },
  killed: { label: "Killed", color: "text-destructive" },
};

export function DossierHeader({ product }: { product: ProductWithAnalysis }) {
  const researchProduct = useResearchProduct();
  const updateStatus = useUpdateProductStatus();
  const analysis = product.product_analysis?.[0];
  const links = product.product_links || [];
  const suppliers = product.product_suppliers || [];
  const economics = product.product_unit_economics?.[0];

  const retailVerified = links.filter(l => l.link_type === "retail" && l.validation_status === "verified").length;
  const wholesaleVerified = links.filter(l => l.link_type === "wholesale" && l.validation_status === "verified").length;
  const readiness = (product as any).readiness_state || "research_only";
  const readinessInfo = READINESS_LABELS[readiness] || READINESS_LABELS.research_only;
  const identityConf = (product as any).identity_confidence ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{product.name}</h1>
          {(product as any).canonical_name && (product as any).canonical_name !== product.name && (
            <p className="text-sm text-muted-foreground">Canonical: {(product as any).canonical_name}</p>
          )}
          {(product as any).short_description && (
            <p className="text-sm text-muted-foreground mt-1">{(product as any).short_description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => researchProduct.mutate({ product_id: product.id })}
            disabled={researchProduct.isPending}
          >
            {researchProduct.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Search className="w-4 h-4 mr-1" />}
            AI Research
          </Button>
        </div>
      </div>

      {/* Summary stats strip */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge className={`${STATUS_COLORS[product.status]} text-xs`} variant="outline">
          {product.status}
        </Badge>
        <Badge variant="outline" className={`text-xs ${readinessInfo.color}`}>
          {readinessInfo.label}
        </Badge>
        {identityConf > 0 && (
          <Badge variant="outline" className="text-xs">Identity: {identityConf}%</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          Retail: <span className="font-medium text-foreground">{retailVerified} verified</span>
        </span>
        <span className="text-xs text-muted-foreground">
          Wholesale: <span className="font-medium text-foreground">{wholesaleVerified} verified</span>
        </span>
        {economics?.net_margin_pct != null && (
          <span className="text-xs text-muted-foreground">
            Margin: <span className={`font-medium ${economics.net_margin_pct >= 20 ? "text-green-500" : economics.net_margin_pct >= 0 ? "text-yellow-500" : "text-destructive"}`}>
              {economics.net_margin_pct}%
            </span>
          </span>
        )}
        {analysis?.overall_score != null && (
          <span className="text-xs text-muted-foreground">
            Score: <span className="font-medium text-foreground">{analysis.overall_score}/100</span>
          </span>
        )}
      </div>
    </div>
  );
}
