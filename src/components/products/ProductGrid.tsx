import { useState } from "react";
import { useProducts, type ProductStatus, type ProductWithAnalysis } from "@/hooks/use-products";
import { ProductDetailCard } from "./ProductDetailCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowDownAZ, ArrowUpDown, TrendingUp } from "lucide-react";

type SortMode = "score" | "newest" | "margin";

const SORT_LABELS: Record<SortMode, string> = {
  score: "Score",
  newest: "Newest",
  margin: "Margin",
};

function sortProducts(products: ProductWithAnalysis[], mode: SortMode): ProductWithAnalysis[] {
  const sorted = [...products];
  switch (mode) {
    case "score":
      return sorted.sort((a, b) => {
        const sa = a.product_analysis?.[0]?.overall_score ?? 0;
        const sb = b.product_analysis?.[0]?.overall_score ?? 0;
        return sb - sa;
      });
    case "margin":
      return sorted.sort((a, b) => (b.estimated_margin_pct ?? 0) - (a.estimated_margin_pct ?? 0));
    case "newest":
    default:
      return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
}

export function ProductGrid({ status }: { status?: ProductStatus }) {
  const { data: products, isLoading } = useProducts(status);
  const [sort, setSort] = useState<SortMode>("score");

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!products?.length) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-sm">No products {status ? `with status "${status}"` : "yet"}.</p>
        <p className="text-xs mt-1">Add your first product to get started.</p>
      </div>
    );
  }

  const sorted = sortProducts(products, sort);

  return (
    <div className="space-y-3">
      {/* Sort controls */}
      <div className="flex items-center gap-1.5">
        <ArrowUpDown className="w-3.5 h-3.5 text-muted-foreground" />
        {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
          <Button
            key={mode}
            variant={sort === mode ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setSort(mode)}
          >
            {SORT_LABELS[mode]}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((p) => (
          <ProductDetailCard key={p.id} product={p} />
        ))}
      </div>
    </div>
  );
}
