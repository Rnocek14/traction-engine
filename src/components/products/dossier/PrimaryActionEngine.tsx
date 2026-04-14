import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Video, Upload, Link, AlertCircle, CheckCircle2,
  Download, Plus, ImageIcon, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useGenerateVideoConcepts, useQueueVideoConcepts, useProductStoryJobs } from "@/hooks/use-product-videos";
import { type ProductWithAnalysis } from "@/hooks/use-products";

type EngineState = "incomplete" | "ready" | "generating" | "done";

interface MissingItem {
  key: string;
  label: string;
  icon: React.ReactNode;
}

export function PrimaryActionEngine({ product }: { product: ProductWithAnalysis }) {
  const qc = useQueryClient();
  const [imageUrl, setImageUrl] = useState("");
  const [purchaseUrl, setPurchaseUrl] = useState("");
  const [showInputs, setShowInputs] = useState(false);

  const generateMutation = useGenerateVideoConcepts();
  const queueMutation = useQueueVideoConcepts();
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

  // Determine what's missing
  const hasImages = (product.product_images?.length || 0) > 0 || !!product.image_url;
  const hasPurchaseUrl = !!product.purchase_url;
  const jobs = existingJobs.data || [];
  const completedJobs = jobs.filter(
    (j) => j.assembled_status === "succeeded" && j.assembled_video_url
  );
  const pendingJobs = jobs.filter(
    (j) => j.status !== "done" || (j.assembled_status && j.assembled_status !== "succeeded")
  );

  const missing: MissingItem[] = [];
  if (!hasImages) missing.push({ key: "image", label: "Product image", icon: <ImageIcon className="w-4 h-4" /> });
  if (!hasPurchaseUrl) missing.push({ key: "url", label: "Purchase URL", icon: <Link className="w-4 h-4" /> });

  const isGenerating = generateMutation.isPending || queueMutation.isPending;

  let state: EngineState = "incomplete";
  if (missing.length === 0) state = "ready";
  if (isGenerating) state = "generating";
  if (completedJobs.length > 0) state = "done";

  // Handle adding image URL inline
  const handleAddImage = useCallback(async () => {
    if (!imageUrl.trim()) return;
    const { error } = await supabase.from("product_images").insert({
      product_id: product.id,
      url: imageUrl.trim(),
      source: "manual",
      label: "hero",
      is_primary: true,
      verified: true,
    });
    if (error) {
      toast.error("Failed to add image");
      return;
    }
    toast.success("Image added");
    setImageUrl("");
    qc.invalidateQueries({ queryKey: ["product-detail"] });
  }, [imageUrl, product.id, qc]);

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

  // One-click: generate concepts → auto-approve all → auto-queue
  const handleCreateVideo = useCallback(async () => {
    try {
      const result = await generateMutation.mutateAsync(product.id);
      if (!result.concepts || result.concepts.length === 0) {
        toast.error("No concepts generated");
        return;
      }

      // Auto-queue with first available account
      const accountId = autoAccount?.account_id;
      if (!accountId) {
        toast.error("No active account found. Create an account first in Settings.");
        return;
      }

      await queueMutation.mutateAsync({
        productId: product.id,
        concepts: result.concepts,
        accountId,
      });

      existingJobs.refetch();
    } catch {
      // errors handled by mutation hooks
    }
  }, [product.id, autoAccount, generateMutation, queueMutation, existingJobs]);

  return (
    <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 space-y-4">
      {/* State: Incomplete */}
      {state === "incomplete" && !isGenerating && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Video className="w-5 h-5 text-primary" />
                Create First Video
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Fix the items below, then click to generate
              </p>
            </div>
            <Button size="lg" disabled className="opacity-50 gap-2">
              <Video className="w-4 h-4" /> Create First Video
            </Button>
          </div>

          {/* Missing items with inline fix */}
          <div className="space-y-3">
            {missing.map((item) => (
              <div key={item.key} className="flex items-start gap-3 bg-background rounded-lg p-3 border border-destructive/20">
                <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <span className="text-sm font-medium">{item.label} missing</span>
                  {item.key === "image" && (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Paste image URL..."
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        className="h-8 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && handleAddImage()}
                      />
                      <Button size="sm" className="h-8 shrink-0" onClick={handleAddImage} disabled={!imageUrl.trim()}>
                        <Upload className="w-3.5 h-3.5 mr-1" /> Add
                      </Button>
                    </div>
                  )}
                  {item.key === "url" && (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Paste Shopify product URL..."
                        value={purchaseUrl}
                        onChange={(e) => setPurchaseUrl(e.target.value)}
                        className="h-8 text-sm"
                        onKeyDown={(e) => e.key === "Enter" && handleAddPurchaseUrl()}
                      />
                      <Button size="sm" className="h-8 shrink-0" onClick={handleAddPurchaseUrl} disabled={!purchaseUrl.trim()}>
                        <Link className="w-3.5 h-3.5 mr-1" /> Save
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* State: Ready */}
      {state === "ready" && !isGenerating && completedJobs.length === 0 && (
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Video className="w-5 h-5 text-primary" />
              Create First Video
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Product is ready — AI will generate 5 ad concepts and queue them automatically
            </p>
          </div>
          <Button size="lg" onClick={handleCreateVideo} className="gap-2 bg-primary hover:bg-primary/90">
            <Video className="w-4 h-4" /> Create First Video
          </Button>
        </div>
      )}

      {/* State: Generating */}
      {isGenerating && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <div>
              <h2 className="text-lg font-semibold">
                {generateMutation.isPending ? "Generating video concepts..." : "Queueing videos..."}
              </h2>
              <p className="text-sm text-muted-foreground">This takes 15-30 seconds</p>
            </div>
          </div>
          <Progress value={generateMutation.isPending ? 40 : 80} className="h-2" />
        </div>
      )}

      {/* State: Done — videos exist */}
      {state === "done" && !isGenerating && (
        <div className="space-y-3">
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

          {/* Download list */}
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
        </div>
      )}

      {/* Pending jobs indicator (shown in ready/done states) */}
      {pendingJobs.length > 0 && !isGenerating && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground pt-1 border-t">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {pendingJobs.length} video{pendingJobs.length !== 1 ? "s" : ""} still processing...
        </div>
      )}

      {/* Quick info: purchase URL and account */}
      {state !== "incomplete" && (
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
        </div>
      )}
    </div>
  );
}
