import { useParams, useNavigate } from "react-router-dom";
import { GlobalNav } from "@/components/GlobalNav";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";
import { useProductDetail } from "@/hooks/use-product-detail";
import { ProductIdentitySection } from "@/components/products/dossier/ProductIdentitySection";
import { RetailEvidenceSection } from "@/components/products/dossier/RetailEvidenceSection";
import { WholesaleEvidenceSection } from "@/components/products/dossier/WholesaleEvidenceSection";
import { DossierHeader } from "@/components/products/dossier/DossierHeader";

export default function ProductDossier() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { data: product, isLoading, error } = useProductDetail(productId);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <GlobalNav />
        <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </main>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-background">
        <GlobalNav />
        <main className="max-w-5xl mx-auto px-4 py-12 text-center">
          <p className="text-muted-foreground">Product not found.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/products")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Products
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/products")} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Products
        </Button>

        <DossierHeader product={product} />
        <ProductIdentitySection product={product} />
        <RetailEvidenceSection product={product} />
        <WholesaleEvidenceSection product={product} />
      </main>
    </div>
  );
}
