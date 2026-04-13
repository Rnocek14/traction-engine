import { GlobalNav } from "@/components/GlobalNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProductGrid } from "@/components/products/ProductGrid";
import { ProductEntryForm } from "@/components/products/ProductEntryForm";
import { ViralIntakeForm } from "@/components/products/ViralIntakeForm";
import { ViralVideoList } from "@/components/products/ViralVideoList";
import { Button } from "@/components/ui/button";
import { Loader2, Radar } from "lucide-react";
import { useDiscoverProducts, type ProductStatus } from "@/hooks/use-products";

const TABS: { value: ProductStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "discovered", label: "Discovered" },
  { value: "researching", label: "Researching" },
  { value: "approved", label: "Approved" },
  { value: "active", label: "Active" },
  { value: "dead", label: "Dead" },
];

export default function Products() {
  const discoverProducts = useDiscoverProducts();

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Products</h1>
            <p className="text-sm text-muted-foreground">Research, score, and track products for content marketing</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => discoverProducts.mutate()}
              disabled={discoverProducts.isPending}
            >
              {discoverProducts.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Radar className="w-4 h-4 mr-2" />}
              Discover Products
            </Button>
            <ProductEntryForm />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2">
            <ViralIntakeForm />
          </div>
          <div>
            <ViralVideoList />
          </div>
        </div>

        <Tabs defaultValue="all">
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-4">
              <ProductGrid status={t.value === "all" ? undefined : t.value} />
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
}
