import { useSearchParams } from "react-router-dom";
import { GlobalNav } from "@/components/GlobalNav";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Radar } from "lucide-react";
import { ProductGrid } from "@/components/products/ProductGrid";
import { ProductEntryForm } from "@/components/products/ProductEntryForm";
import { ViralIntakeForm } from "@/components/products/ViralIntakeForm";
import { ViralVideoList } from "@/components/products/ViralVideoList";
import { AppsGrid } from "@/components/apps/AppsGrid";
import { AppEditDialog } from "@/components/apps/AppEditDialog";
import { useDiscoverProducts, type ProductStatus } from "@/hooks/use-products";

const PRODUCT_STATUS_TABS: { value: ProductStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "discovered", label: "Discovered" },
  { value: "researching", label: "Researching" },
  { value: "approved", label: "Approved" },
  { value: "active", label: "Active" },
  { value: "test_listing", label: "🧪 Testing" },
  { value: "scaled_listing", label: "🚀 Scaled" },
  { value: "dead", label: "Dead" },
];

export default function Catalog() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "products" ? "products" : "apps";
  const discoverProducts = useDiscoverProducts();

  return (
    <div className="min-h-screen bg-background">
      <GlobalNav />
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Catalog</h1>
            <p className="text-sm text-muted-foreground">
              Apps and products are equal monetization assets. Marketed across verticals.
            </p>
          </div>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => setParams({ tab: v })}
        >
          <TabsList>
            <TabsTrigger value="apps">Apps</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
          </TabsList>

          <TabsContent value="apps" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Strategic priority. Promoted when the vertical fits.
              </p>
              <AppEditDialog
                trigger={
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add app
                  </Button>
                }
              />
            </div>
            <AppsGrid />
          </TabsContent>

          <TabsContent value="products" className="mt-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Opportunistic monetization. Product-led verticals (gadgets/home/toys) override the mix.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => discoverProducts.mutate()}
                  disabled={discoverProducts.isPending}
                >
                  {discoverProducts.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Radar className="w-4 h-4 mr-2" />
                  )}
                  Discover Products
                </Button>
                <ProductEntryForm />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <ViralIntakeForm />
              </div>
              <div>
                <ViralVideoList />
              </div>
            </div>

            <Tabs defaultValue="all">
              <TabsList>
                {PRODUCT_STATUS_TABS.map((t) => (
                  <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
                ))}
              </TabsList>
              {PRODUCT_STATUS_TABS.map((t) => (
                <TabsContent key={t.value} value={t.value} className="mt-4">
                  <ProductGrid status={t.value === "all" ? undefined : t.value} />
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
