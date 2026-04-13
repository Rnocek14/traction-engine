import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface VideoScene {
  type: "image_motion" | "ai_generated" | "text_overlay";
  referenceImageUrl?: string;
  prompt: string;
  duration: number;
  onScreenText?: string;
}

export interface VideoConcept {
  hook: string;
  angle: string;
  format: string;
  scenes: VideoScene[];
  voiceover: string;
  caption: string;
  cta: string;
}

export function useGenerateVideoConcepts() {
  return useMutation({
    mutationFn: async (productId: string) => {
      const { data, error } = await supabase.functions.invoke("product-to-videos", {
        body: { product_id: productId, mode: "generate" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to generate concepts");
      return data as { success: true; concepts: VideoConcept[]; image_count: number };
    },
    onError: (err: Error) => {
      toast.error("Failed to generate video concepts", { description: err.message });
    },
  });
}

export function useQueueVideoConcepts() {
  return useMutation({
    mutationFn: async ({ productId, concepts, accountId }: {
      productId: string;
      concepts: VideoConcept[];
      accountId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("product-to-videos", {
        body: { product_id: productId, mode: "queue", approved_concepts: concepts, account_id: accountId },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to queue videos");
      return data as { success: true; job_ids: string[]; queued: number };
    },
    onSuccess: (data) => {
      toast.success(`${data.queued} video(s) queued for production`);
    },
    onError: (err: Error) => {
      toast.error("Failed to queue videos", { description: err.message });
    },
  });
}

export function useProductStoryJobs(productId: string | undefined) {
  return useQuery({
    queryKey: ["product-story-jobs", productId],
    queryFn: async () => {
      if (!productId) return [];
      const { data, error } = await supabase
        .from("story_jobs")
        .select("id, title, status, assembled_status, assembled_video_url, created_at, storyboard_json, total_clips, completed_clips")
        .eq("product_id", productId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!productId,
  });
}
