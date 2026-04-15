import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImageIcon, CheckCircle2, Trash2, ChevronLeft, ChevronRight, Star, Download, Loader2 } from "lucide-react";
import { type ProductWithAnalysis } from "@/hooks/use-products";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useMutation } from "@tanstack/react-query";

export interface NormalizedAsset {
  id: string;
  url: string;
  label: string;
  source: string;
  is_primary: boolean;
  verified: boolean;
  manually_approved: boolean;
  origin: "product_images" | "product_hero";
}

const SOURCE_PRIORITY: Record<string, number> = {
  pinned_supplier: 0,
  confirmed_retail: 1,
  confirmed_wholesale: 2,
  manual: 3,
  ai_search: 4,
  product_url: 5,
};

/** Build a normalized asset list from all available sources */
export function buildAssetList(product: ProductWithAnalysis): NormalizedAsset[] {
  const assets: NormalizedAsset[] = [];
  const seenUrls = new Set<string>();

  // 1. All product_images sorted by: pinned_supplier first, then verified, then primary
  const images = [...(product.product_images || [])];
  images.sort((a, b) => {
    const aPri = SOURCE_PRIORITY[a.source] ?? 99;
    const bPri = SOURCE_PRIORITY[b.source] ?? 99;
    if (aPri !== bPri) return aPri - bPri;
    if (a.verified !== b.verified) return a.verified ? -1 : 1;
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return 0;
  });

  for (const img of images) {
    if (seenUrls.has(img.url)) continue;
    seenUrls.add(img.url);
    assets.push({
      id: img.id,
      url: img.url,
      label: img.label || "hero",
      source: img.source || "ai_search",
      is_primary: img.is_primary,
      verified: img.verified,
      manually_approved: (img as any).manually_approved || false,
      origin: "product_images",
    });
  }

  // 2. Fallback to products.image_url
  if (product.image_url && !seenUrls.has(product.image_url)) {
    assets.push({
      id: "hero-fallback",
      url: product.image_url,
      label: "hero",
      source: "product_url",
      is_primary: assets.length === 0,
      verified: false,
      manually_approved: false,
      origin: "product_hero",
    });
  }

  return assets;
}

export function MarketingAssetsSection({ product }: { product: ProductWithAnalysis }) {
  const [imgIdx, setImgIdx] = useState(0);
  const qc = useQueryClient();
  const assets = buildAssetList(product);
  const current = assets[imgIdx];

  const harvestImages = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("harvest-product-images", {
        body: { product_id: product.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Harvested ${data?.saved || 0} verified images`);
      qc.invalidateQueries({ queryKey: ["product-detail"] });
    },
    onError: (err: Error) => toast.error("Image harvest failed", { description: err.message }),
  });

  const handleVerify = async (asset: NormalizedAsset) => {
    if (asset.origin !== "product_images") return;
    const { error } = await supabase.from("product_images").update({ verified: true }).eq("id", asset.id);
    if (error) { toast.error("Failed to verify"); return; }
    toast.success("Image verified");
    qc.invalidateQueries({ queryKey: ["product-detail"] });
  };

  const handleDelete = async (asset: NormalizedAsset) => {
    if (asset.origin !== "product_images") return;
    const { error } = await supabase.from("product_images").delete().eq("id", asset.id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Image removed");
    qc.invalidateQueries({ queryKey: ["product-detail"] });
    setImgIdx(0);
  };

  const handleSetPrimary = async (asset: NormalizedAsset) => {
    if (asset.origin !== "product_images") return;
    // Unset all primary first
    await supabase.from("product_images").update({ is_primary: false }).eq("product_id", product.id);
    await supabase.from("product_images").update({ is_primary: true }).eq("id", asset.id);
    toast.success("Set as primary");
    qc.invalidateQueries({ queryKey: ["product-detail"] });
  };

  const verifiedCount = assets.filter(a => a.verified || a.manually_approved).length;
  const totalCount = assets.length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <ImageIcon className="w-5 h-5" /> Marketing Assets
          <span className="text-sm font-normal text-muted-foreground ml-auto">
            {totalCount} image{totalCount !== 1 ? "s" : ""}
            {verifiedCount > 0 && <> · {verifiedCount} verified</>}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => harvestImages.mutate()}
            disabled={harvestImages.isPending}
          >
            {harvestImages.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Harvest Images
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {assets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Main preview */}
            <div className="relative rounded-lg overflow-hidden bg-muted/30">
              <img
                src={current?.url}
                alt={product.name}
                className="w-full h-64 object-contain"
                onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
              />
              {/* Status badges */}
              <div className="absolute top-2 left-2 flex items-center gap-1">
                {current?.source === "pinned_supplier" ? (
                  <Badge className="text-[10px] bg-green-500/20 text-green-500 border-green-500/30">📌 supplier</Badge>
                ) : current?.verified ? (
                  <Badge className="text-[10px] bg-green-500/20 text-green-500 border-green-500/30">✓ verified</Badge>
                ) : current?.manually_approved ? (
                  <Badge className="text-[10px] bg-blue-500/20 text-blue-500 border-blue-500/30">✓ approved</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] bg-yellow-500/10 text-yellow-600 border-yellow-500/30">unverified</Badge>
                )}
              </div>
              <Badge variant="outline" className="absolute top-2 right-2 text-[10px] bg-background/80">
                {current?.source === "pinned_supplier" ? "Pinned Supplier" : current?.source} · {current?.label}
              </Badge>
              {/* Actions */}
              {current?.origin === "product_images" && (
                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                  {!current.verified && (
                    <Button variant="secondary" size="sm" className="h-7 px-2 text-xs gap-1"
                      onClick={() => handleVerify(current)} title="Verify image">
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> Verify
                    </Button>
                  )}
                  {!current.is_primary && (
                    <Button variant="secondary" size="sm" className="h-7 px-2 text-xs gap-1"
                      onClick={() => handleSetPrimary(current)} title="Set as primary">
                      <Star className="w-3.5 h-3.5 text-yellow-500" />
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" className="h-7 w-7 p-0"
                    onClick={() => handleDelete(current)} title="Remove image">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              )}
              {/* Nav */}
              {assets.length > 1 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
                  <Button variant="secondary" size="sm" className="h-7 w-7 p-0 rounded-full"
                    onClick={() => setImgIdx((imgIdx - 1 + assets.length) % assets.length)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs bg-background/80 px-2 py-0.5 rounded-full">
                    {imgIdx + 1}/{assets.length}
                  </span>
                  <Button variant="secondary" size="sm" className="h-7 w-7 p-0 rounded-full"
                    onClick={() => setImgIdx((imgIdx + 1) % assets.length)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Thumbnail grid */}
            <div className="grid grid-cols-3 gap-2 content-start">
              {assets.map((asset, i) => (
                <button
                  key={asset.id}
                  onClick={() => setImgIdx(i)}
                  className={`relative rounded-lg overflow-hidden aspect-square border-2 transition-colors ${
                    i === imgIdx ? "border-primary" : "border-transparent hover:border-primary/30"
                  }`}
                >
                  <img src={asset.url} alt="" className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }} />
                  {asset.verified && (
                    <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    </div>
                  )}
                  {asset.is_primary && (
                    <div className="absolute bottom-0.5 left-0.5">
                      <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="w-full py-8 rounded-lg bg-muted/30 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <ImageIcon className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm font-medium">No marketing assets</p>
              <p className="text-xs mt-1">Run AI Research to discover product images, or add images manually</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
