import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { type ProductWithAnalysis } from "@/hooks/use-products";

export function ProductIdentitySection({ product }: { product: ProductWithAnalysis }) {
  const analysis = product.product_analysis?.[0];
  const p = product as any;

  const distinctiveAttrs: string[] = p.distinctive_attributes || [];
  const excludedVariants: string[] = p.excluded_variants || [];
  const synonyms: string[] = p.synonyms || [];

  const links = product.product_links || [];
  const retailMatched = links.filter(l => l.link_type === "retail" && l.validation_status !== "rejected").length;
  const wholesaleMatched = links.filter(l => l.link_type === "wholesale" && l.validation_status !== "rejected").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="w-5 h-5" /> Product Identity
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-4">
            <div className="space-y-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <p className="text-sm font-medium">{product.name}</p>
              </div>
              {p.canonical_name && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Canonical Name</label>
                  <p className="text-sm">{p.canonical_name}</p>
                </div>
              )}
              {product.category && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <p className="text-sm">{product.category}{product.subcategory ? ` / ${product.subcategory}` : ""}</p>
                </div>
              )}
              {p.short_description && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  <p className="text-sm">{p.short_description}</p>
                </div>
              )}
            </div>

            {/* Distinctive attributes */}
            {distinctiveAttrs.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Distinctive Attributes</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {distinctiveAttrs.map(a => (
                    <Badge key={a} variant="secondary" className="text-xs">{a}</Badge>
                  ))}
                </div>
              </div>
            )}

            {synonyms.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Synonyms</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {synonyms.map(s => (
                    <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}

            {excludedVariants.length > 0 && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Excluded Variants</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {excludedVariants.map(v => (
                    <Badge key={v} variant="outline" className="text-xs text-destructive border-destructive/30">{v}</Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Identity confidence summary */}
            <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
              <p className="text-xs font-medium">Identity Confidence</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Retail links matched</span>
                  <span className="font-medium">{retailMatched}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Wholesale matched</span>
                  <span className="font-medium">{wholesaleMatched}</span>
                </div>
                {analysis?.overall_score != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Analysis score</span>
                    <span className="font-medium">{analysis.overall_score}/100</span>
                  </div>
                )}
                {analysis?.trending_status && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trend</span>
                    <span className="font-medium">{analysis.trending_status}</span>
                  </div>
                )}
              </div>
            </div>
        </div>
      </CardContent>
    </Card>
  );
}
