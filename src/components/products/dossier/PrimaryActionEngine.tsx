import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Video, CheckCircle2,
  Download, Plus, Link, ExternalLink,
  AlertCircle, RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useProductStoryJobs } from "@/hooks/use-product-videos";
import { useResearchProduct } from "@/hooks/use-products";
import { type ProductWithAnalysis } from "@/hooks/use-products";

type EnginePhase =
  | "idle"
  | "scraping"
  | "generating"
  | "clips"
  | "assembling"
  | "done"
  | "failed";

const PHASE_LABELS: Record<EnginePhase, string> = {
  idle: "",
  scraping: "Scraping product images from retail links...",
  generating: "Generating concepts & queuing clips...",
  clips: "Rendering video clips with AI...",
  assembling: "Assembling final videos...",
  done: "Videos ready!",
  failed: "Something went wrong.",
};

const PHASE_PROGRESS: Record<EnginePhase, number> = {
  idle: 0,
  scraping: 10,
  generating: 25,
  clips: 50,
  assembling: 85,
  done: 100,
  failed: 0,
};

const POLL_INTERVAL = 5000;
const TIMEOUT_MS = 10 * 60 * 1000; // 10 min

export function PrimaryActionEngine({ product }: { product: ProductWithAnalysis }) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<EnginePhase>("idle");
  const [purchaseUrl, setPurchaseUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [clipProgress, setClipProgress] = useState({ done: 0, total: 0 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jobIdsRef = useRef<string[]>([]);

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
    (j) => j.status !== "failed" && !(j.assembled_status === "succeeded" && j.assembled_video_url)
  );

  const isBusy = phase !== "idle" && phase !== "done" && phase !== "failed";

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Poll story_jobs + video_jobs for progress
  const startPolling = useCallback((jobIds: string[]) => {
    jobIdsRef.current = jobIds;

    // Set timeout
    timeoutRef.current = setTimeout(() => {
      if (pollRef.current) clearInterval(pollRef.current);
      setPhase("failed");
      setErrorMsg("Timed out after 10 minutes. Some clips may still finish in the background.");
    }, TIMEOUT_MS);

    pollRef.current = setInterval(async () => {
      try {
        // Check video_jobs for these story_jobs
        const { data: videoJobs } = await supabase
          .from("video_jobs")
          .select("id, status, story_job_id")
          .in("story_job_id", jobIdsRef.current);

        const total = videoJobs?.length || 0;
        const done = videoJobs?.filter((v) => v.status === "done").length || 0;
        const failed = videoJobs?.filter((v) => v.status === "failed").length || 0;

        setClipProgress({ done, total });

        if (total > 0 && done > 0) {
          // Update phase based on progress
          if (done + failed >= total) {
            // All clips finished — check assemblies
            setPhase("assembling");

            // Trigger assembly for each story_job that has all clips done
            for (const sjId of jobIdsRef.current) {
              const sjClips = videoJobs?.filter((v) => v.story_job_id === sjId) || [];
              const sjDone = sjClips.filter((v) => v.status === "done").length;
              if (sjDone > 0) {
                // Trigger assembly
                try {
                  await supabase.functions.invoke("assemble-reel", {
                    body: { story_job_id: sjId },
                  });
                } catch {
                  // Assembly might already be triggered
                }
              }
            }

            // Now poll for assembled videos
            const { data: storyJobs } = await supabase
              .from("story_jobs")
              .select("id, assembled_status, assembled_video_url")
              .in("id", jobIdsRef.current);

            const assembled = storyJobs?.filter(
              (s) => s.assembled_status === "succeeded" && s.assembled_video_url
            ).length || 0;
            const assemblyFailed = storyJobs?.filter(
              (s) => s.assembled_status === "failed"
            ).length || 0;

            if (assembled + assemblyFailed >= jobIdsRef.current.length) {
              // Done!
              if (pollRef.current) clearInterval(pollRef.current);
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setPhase(assembled > 0 ? "done" : "failed");
              if (assembled === 0) setErrorMsg("All assemblies failed. Try again.");
              existingJobs.refetch();
              qc.invalidateQueries({ queryKey: ["product-story-jobs"] });
            }
          } else {
            setPhase("clips");
          }
        }
      } catch {
        // Polling error — keep going
      }
    }, POLL_INTERVAL);
  }, [existingJobs, qc]);

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

  // Full one-click pipeline
  const handleCreateVideo = useCallback(async () => {
    setErrorMsg("");
    try {
      // Step 1: If no images, try scraping
      if (!hasImages && hasLinks) {
        setPhase("scraping");
        try {
          await researchProduct.mutateAsync({ product_id: product.id });
          await qc.invalidateQueries({ queryKey: ["product-detail"] });
        } catch {
          // Continue anyway
        }
      }

      // Step 2: Call orchestrator
      setPhase("generating");

      const accountId = autoAccount?.account_id;
      if (!accountId) {
        toast.error("No active account found. Create one in Settings first.");
        setPhase("idle");
        return;
      }

      const { data, error } = await supabase.functions.invoke("produce-product-video", {
        body: { product_id: product.id, account_id: accountId },
      });

      if (error || !data?.success) {
        setPhase("failed");
        setErrorMsg(data?.error || error?.message || "Failed to start pipeline");
        return;
      }

      // Step 3: Start polling for clip progress
      setPhase("clips");
      setClipProgress({ done: 0, total: data.total * 2 }); // estimate ~2 clips per job
      startPolling(data.job_ids);
      existingJobs.refetch();
    } catch (e) {
      setPhase("failed");
      setErrorMsg(e instanceof Error ? e.message : "Unknown error");
    }
  }, [product.id, hasImages, hasLinks, autoAccount, researchProduct, qc, startPolling, existingJobs]);

  const handleRetry = useCallback(() => {
    setPhase("idle");
    setErrorMsg("");
    setClipProgress({ done: 0, total: 0 });
    if (pollRef.current) clearInterval(pollRef.current);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  // ============ RENDER ============

  // DONE state
  if ((phase === "done" || completedJobs.length > 0) && !isBusy) {
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

  // FAILED state
  if (phase === "failed") {
    return (
      <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-destructive" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Video Creation Failed</h2>
            <p className="text-sm text-muted-foreground">{errorMsg || "Something went wrong."}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRetry} className="gap-2 shrink-0">
            <RotateCcw className="w-4 h-4" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  // BUSY state (scraping → generating → clips → assembling)
  if (isBusy) {
    const progressValue = PHASE_PROGRESS[phase] + 
      (phase === "clips" && clipProgress.total > 0
        ? (clipProgress.done / clipProgress.total) * 35
        : 0);

    return (
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Creating videos...</h2>
            <p className="text-sm text-muted-foreground">{PHASE_LABELS[phase]}</p>
          </div>
        </div>
        <Progress value={Math.min(progressValue, 99)} className="h-2" />
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <StepDot label="Concepts" active={phase === "generating"} done={["clips", "assembling", "done"].includes(phase)} />
          <StepDot label="Clips" active={phase === "clips"} done={["assembling", "done"].includes(phase)} 
            detail={clipProgress.total > 0 ? `${clipProgress.done}/${clipProgress.total}` : undefined} />
          <StepDot label="Assembly" active={phase === "assembling"} done={phase === "done"} />
        </div>
      </div>
    );
  }

  // IDLE — ready to create
  return (
    <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-5 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            {jobs.length > 0 ? "Create More Videos" : "Create First Video"}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            One click — AI generates concepts, renders clips, and assembles finished videos
          </p>
        </div>
        <Button size="lg" onClick={handleCreateVideo} className="gap-2 bg-primary hover:bg-primary/90 shrink-0">
          <Video className="w-4 h-4" /> {jobs.length > 0 ? "Create Videos" : "Create First Video"}
        </Button>
      </div>

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

function StepDot({ label, active, done, detail }: { label: string; active: boolean; done: boolean; detail?: string }) {
  return (
    <span className={`flex items-center gap-1.5 ${active ? "text-primary font-medium" : done ? "text-green-600" : "text-muted-foreground/50"}`}>
      {done ? (
        <CheckCircle2 className="w-3.5 h-3.5" />
      ) : active ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <span className="w-3.5 h-3.5 rounded-full border border-current inline-block" />
      )}
      {label}
      {detail && <span className="text-[10px] opacity-70">({detail})</span>}
    </span>
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
