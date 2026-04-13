import { useProducts, type ProductStatus } from "@/hooks/use-products";
import { ProductDetailCard } from "./ProductDetailCard";
import { Skeleton } from "@/components/ui/skeleton";

export function ProductGrid({ status }: { status?: ProductStatus }) {
  const { data: products, isLoading } = useProducts(status);

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

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {products.map((p) => (
        <ProductDetailCard key={p.id} product={p} />
      ))}
    </div>
  );
}
