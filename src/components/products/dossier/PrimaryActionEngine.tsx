import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Video, CheckCircle2,
  Download, Plus, Link, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useGenerateVideoConcepts, useQueueVideoConcepts, useProductStoryJobs } from "@/hooks/use-product-videos";
import { useResearchProduct } from "@/hooks/use-products";
import { type ProductWithAnalysis } from "@/hooks/use-products";

type EnginePhase = "idle" | "scraping" | "generating" | "queueing";

export function PrimaryActionEngine({ product }: { product: ProductWithAnalysis }) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<EnginePhase>("idle");
  const [purchaseUrl, setPurchaseUrl] = useState("");

  const generateMutation = useGenerateVideoConcepts();
  const queueMutation = useQueueVideoConcepts();
  const researchProduct = useResearchProduct();
  const existingJobs = useProductStoryJobs(product.id);

  // Get first active account automatically
  const { data: autoAccount } = useQuery({
    queryKey: ["auto-account"],
    queryFn: async () => {
      const { data } = await supabase
        .from("account_configs")
        .select("account_id, account_name, vertical")
        .eq("status", "active")
        .order("priority_score", { ascending: false })
        .limit(1);
      return data?.[0] || null;
    },
  });

  const hasImages = (product.product_images?.length || 0) > 0 || !!product.image_url;
  const hasPurchaseUrl = !!product.purchase_url;
  const hasLinks = (product.product_links?.length || 0) > 0;
  const jobs = existingJobs.data || [];
  const completedJobs = jobs.filter(
    (j) => j.assembled_status === "succeeded" && j.assembled_video_url
  );
  const pendingJobs = jobs.filter(
    (j) => j.status !== "done" || (j.assembled_status && j.assembled_status !== "succeeded")
  );

  const isBusy = phase !== "idle";

  // Handle adding purchase URL inline
  const handleAddPurchaseUrl = useCallback(async () => {
    if (!purchaseUrl.trim()) return;
    const { error } = await supabase
      .from("products")
      .update({ purchase_url: purchaseUrl.trim() })
      .eq("id", product.id);
    if (error) {
      toast.error("Failed to update purchase URL");
      return;
    }
    toast.success("Purchase URL saved");
    setPurchaseUrl("");
    qc.invalidateQueries({ queryKey: ["product-detail"] });
  }, [purchaseUrl, product.id, qc]);

  // Full one-click flow: scrape images (if needed) → generate concepts → queue
  const handleCreateVideo = useCallback(async () => {
    try {
      // Step 1: If no images, auto-run AI Research to scrape from links
      if (!hasImages && hasLinks) {
        setPhase("scraping");
        toast.info("Scraping product images from links...");
        try {
          await researchProduct.mutateAsync({ product_id: product.id });
          await qc.invalidateQueries({ queryKey: ["product-detail"] });
        } catch {
          toast.warning("Image scraping had issues — generating with AI-only scenes");
        }
      }

      // Step 2: Generate concepts
      setPhase("generating");
      const result = await generateMutation.mutateAsync(product.id);
      if (!result.concepts || result.concepts.length === 0) {
        toast.error("No concepts generated");
        setPhase("idle");
        return;
      }

      // Step 3: Auto-queue
      const accountId = autoAccount?.account_id;
      if (!accountId) {
        toast.error("No active account found. Create one in Settings first.");
        setPhase("idle");
        return;
      }

      setPhase("queueing");
      await queueMutation.mutateAsync({
        productId: product.id,
        concepts: result.concepts,
        accountId,
      });

      existingJobs.refetch();
      setPhase("idle");
    } catch {
      setPhase("idle");
    }
  }, [product.id, hasImages, hasLinks, autoAccount, generateMutation, queueMutation, researchProduct, existingJobs, qc]);

  const phaseLabel: Record<EnginePhase, string> = {
    idle: "",
    scraping: "Scraping product images from retail links...",
    generating: "AI is generating 5 video concepts...",
    queueing: "Queueing videos for production...",
  };

  const phaseProgress: Record<EnginePhase, number> = {
    idle: 0,
    scraping: 20,
    generating: 55,
    queueing: 85,
  };

  // Show "done" state if completed videos exist
  if (completedJobs.length > 0 && !isBusy) {
    return (
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              {completedJobs.length} Video{completedJobs.length !== 1 ? "s" : ""} Ready
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Download and post to your accounts
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleCreateVideo} className="gap-2">
            <Plus className="w-4 h-4" /> Create More
          </Button>
        </div>

        <div className="space-y-2">
          {completedJobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between bg-background rounded-lg p-3 border">
              <span className="text-sm font-medium truncate flex-1 mr-3">
                {job.title || "Untitled video"}
              </span>
              <Button size="sm" className="gap-1.5 shrink-0" asChild>
                <a href={job.assembled_video_url!} download target="_blank" rel="noopener noreferrer">
                  <Download className="w-3.5 h-3.5" /> Download MP4
                </a>
              </Button>
            </div>
          ))}
        </div>

        {pendingJobs.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1 border-t">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {pendingJobs.length} video{pendingJobs.length !== 1 ? "s" : ""} still processing...
          </div>
        )}

        <QuickInfo product={product} autoAccount={autoAccount} />
      </div>
    );
  }

  // Generating state
  if (isBusy) {
    return (
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Creating videos...</h2>
            <p className="text-sm text-muted-foreground">{phaseLabel[phase]}</p>
          </div>
        </div>
        <Progress value={phaseProgress[phase]} className="h-2" />
      </div>
    );
  }

  // Default: ready to create (no gates except purchase URL as optional warning)
  return (
    <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            Create First Video
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {!hasImages && hasLinks
              ? "Will auto-scrape images from retail links, then generate 5 ad concepts"
              : !hasImages
              ? "No images found — AI will generate scenes from the product description"
              : "Ready — AI will generate 5 ad concepts and queue them automatically"}
          </p>
        </div>
        <Button size="lg" onClick={handleCreateVideo} className="gap-2 bg-primary hover:bg-primary/90 shrink-0">
          <Video className="w-4 h-4" /> Create First Video
        </Button>
      </div>

      {/* Optional: purchase URL inline add if missing */}
      {!hasPurchaseUrl && (
        <div className="flex items-center gap-2 bg-background rounded-lg p-3 border border-yellow-500/30">
          <Link className="w-4 h-4 text-yellow-500 shrink-0" />
          <span className="text-sm text-muted-foreground shrink-0">No purchase URL (CTA will say "Link in bio")</span>
          <Input
            placeholder="Paste Shopify URL..."
            value={purchaseUrl}
            onChange={(e) => setPurchaseUrl(e.target.value)}
            className="h-8 text-sm flex-1"
            onKeyDown={(e) => e.key === "Enter" && handleAddPurchaseUrl()}
          />
          <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={handleAddPurchaseUrl} disabled={!purchaseUrl.trim()}>
            Save
          </Button>
        </div>
      )}

      {pendingJobs.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1 border-t">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {pendingJobs.length} video{pendingJobs.length !== 1 ? "s" : ""} still processing...
        </div>
      )}

      <QuickInfo product={product} autoAccount={autoAccount} />
    </div>
  );
}

function QuickInfo({ product, autoAccount }: { product: ProductWithAnalysis; autoAccount: any }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
      {product.purchase_url && (
        <span className="flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          <a href={product.purchase_url} target="_blank" rel="noopener noreferrer" className="hover:underline truncate max-w-[200px]">
            {product.purchase_url.replace(/https?:\/\//, "").split("/").slice(0, 2).join("/")}
          </a>
        </span>
      )}
      {autoAccount && (
        <Badge variant="outline" className="text-[10px]">
          Account: {autoAccount.account_name || autoAccount.vertical}
        </Badge>
      )}
      <span>{(product.product_images?.length || 0)} images</span>
      <span>{(product.product_links?.length || 0)} links</span>
    </div>
  );
}
