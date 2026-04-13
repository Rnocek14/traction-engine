import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, ChevronLeft, ChevronRight, Trash2, CheckCircle2, ImageIcon } from "lucide-react";
import { type ProductWithAnalysis } from "@/hooks/use-products";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function ProductIdentitySection({ product }: { product: ProductWithAnalysis }) {
  const [imgIdx, setImgIdx] = useState(0);
  const images = product.product_images || [];
  const analysis = product.product_analysis?.[0];
  const qc = useQueryClient();
  const p = product as any;

  const handleVerifyImage = async (imageId: string) => {
    const { error } = await supabase.from("product_images").update({ verified: true }).eq("id", imageId);
    if (error) { toast.error("Failed to verify"); return; }
    toast.success("Image verified");
    qc.invalidateQueries({ queryKey: ["product-detail"] });
  };

  const handleDeleteImage = async (imageId: string) => {
    const { error } = await supabase.from("product_images").delete().eq("id", imageId);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Image removed");
    qc.invalidateQueries({ queryKey: ["product-detail"] });
    setImgIdx(0);
  };

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left: image gallery */}
          <div>
            {images.length > 0 ? (
              <div className="relative rounded-lg overflow-hidden bg-muted/30">
                <img
                  src={images[imgIdx]?.url}
                  alt={product.name}
                  className="w-full h-64 object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
                />
                <div className="absolute top-2 left-2 flex items-center gap-1">
                  {images[imgIdx]?.verified ? (
                    <Badge className="text-[10px] bg-green-500/20 text-green-500 border-green-500/30">✓ verified</Badge>
                  ) : (
                    <Button variant="secondary" size="sm" className="h-6 w-6 p-0 rounded-full"
                      onClick={() => handleVerifyImage(images[imgIdx].id)} title="Verify image">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" className="h-6 w-6 p-0 rounded-full"
                    onClick={() => handleDeleteImage(images[imgIdx].id)} title="Remove image">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
                <Badge variant="outline" className="absolute top-2 right-2 text-[10px] bg-background/80">
                  {images[imgIdx]?.source} · {images[imgIdx]?.label}
                </Badge>
                {images.length > 1 && (
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                    <Button variant="secondary" size="sm" className="h-7 w-7 p-0 rounded-full"
                      onClick={() => setImgIdx((imgIdx - 1 + images.length) % images.length)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-xs bg-background/80 px-2 py-0.5 rounded-full">
                      {imgIdx + 1}/{images.length}
                    </span>
                    <Button variant="secondary" size="sm" className="h-7 w-7 p-0 rounded-full"
                      onClick={() => setImgIdx((imgIdx + 1) % images.length)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full h-64 rounded-lg bg-muted flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <ImageIcon className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">No images yet</p>
                  <p className="text-xs">Run AI Research to discover product images</p>
                </div>
              </div>
            )}
          </div>

          {/* Right: identity details */}
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
        </div>
      </CardContent>
    </Card>
  );
}
