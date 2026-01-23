import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Clip } from "@/types/timeline-types";
import type { Tables } from "@/integrations/supabase/types";

type VideoJob = Tables<"video_jobs">;

// Sora 2 constraints
export type VideoSize = "720x1280" | "1280x720" | "1024x1792" | "1792x1024";
export type VideoDuration = 4 | 8 | 12;

export const SIZE_OPTIONS: { value: VideoSize; label: string; aspectRatio: string }[] = [
  { value: "720x1280", label: "9:16 Vertical (720p)", aspectRatio: "9:16" },
  { value: "1280x720", label: "16:9 Landscape (720p)", aspectRatio: "16:9" },
  { value: "1024x1792", label: "9:16 Pro", aspectRatio: "9:16" },
  { value: "1792x1024", label: "16:9 Pro", aspectRatio: "16:9" },
];

export const DURATION_OPTIONS: { value: VideoDuration; label: string }[] = [
  { value: 4, label: "4 seconds" },
  { value: 8, label: "8 seconds" },
  { value: 12, label: "12 seconds" },
];

export interface GenerateClipVideoParams {
  scriptId: string;
  clip: Clip;
  size?: VideoSize;
  duration?: VideoDuration;
  promptOverride?: string;
}

export interface GenerateAllClipsParams {
  scriptId: string;
  clips: Clip[];
  size?: VideoSize;
  duration?: VideoDuration;
}

const ACTIVE_STATUSES = ["queued", "running", "rendering"];

/**
 * Hook for generating video for a single clip
 */
export function useGenerateClipVideo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scriptId,
      clip,
      size = "720x1280",
      duration = 4,
      promptOverride,
    }: GenerateClipVideoParams): Promise<VideoJob> => {
      const model = size.startsWith("1024") || size.startsWith("1792") ? "sora-2-pro" : "sora-2";

      const { data, error } = await supabase.functions.invoke("queue-video", {
        body: {
          script_run_id: scriptId,
          clip_id: clip.id,
          prompt: promptOverride || clip.prompt,
          settings: {
            size,
            seconds: duration,
            model,
          },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to queue video");

      return data.job;
    },
    onSuccess: (job, variables) => {
      toast({
        title: "Video generation started",
        description: `Clip queued for rendering`,
      });
      queryClient.invalidateQueries({ queryKey: ["video-jobs", variables.scriptId] });
      queryClient.invalidateQueries({ queryKey: ["clip-video-jobs", variables.clip.id] });
    },
    onError: (error) => {
      toast({
        title: "Video generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for generating videos for all clips in batch
 */
export function useGenerateAllClipsVideo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scriptId,
      clips,
      size = "720x1280",
      duration = 4,
    }: GenerateAllClipsParams): Promise<{ queued: number; failed: number; jobs: VideoJob[] }> => {
      const model = size.startsWith("1024") || size.startsWith("1792") ? "sora-2-pro" : "sora-2";
      
      const results = await Promise.allSettled(
        clips
          .filter(c => c.type === "video" && c.prompt && !c.disabled)
          .map(async (clip) => {
            const { data, error } = await supabase.functions.invoke("queue-video", {
              body: {
                script_run_id: scriptId,
                clip_id: clip.id,
                prompt: clip.prompt,
                settings: {
                  size,
                  seconds: duration,
                  model,
                },
              },
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || "Failed to queue");
            return data.job as VideoJob;
          })
      );

      const jobs = results
        .filter((r): r is PromiseFulfilledResult<VideoJob> => r.status === "fulfilled")
        .map((r) => r.value);
      
      const failed = results.filter((r) => r.status === "rejected").length;

      return { queued: jobs.length, failed, jobs };
    },
    onSuccess: (result, variables) => {
      toast({
        title: "Batch video generation started",
        description: `${result.queued} clips queued${result.failed > 0 ? `, ${result.failed} failed` : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: ["video-jobs", variables.scriptId] });
    },
    onError: (error) => {
      toast({
        title: "Batch generation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook to fetch video jobs for a script
 */
export function useVideoJobs(scriptId: string) {
  return useQuery({
    queryKey: ["video-jobs", scriptId],
    queryFn: async (): Promise<VideoJob[]> => {
      const { data, error } = await supabase
        .from("video_jobs")
        .select("*")
        .eq("script_run_id", scriptId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: (query) => {
      // Refetch every 5 seconds if there are active jobs
      const jobs = query.state.data ?? [];
      const hasActive = jobs.some((j) => ACTIVE_STATUSES.includes(j.status));
      return hasActive ? 5000 : false;
    },
  });
}

/**
 * Hook to fetch video job for a specific clip
 */
export function useClipVideoJob(scriptId: string, clipId: string | undefined) {
  return useQuery({
    queryKey: ["clip-video-jobs", clipId],
    enabled: !!clipId,
    queryFn: async (): Promise<VideoJob | null> => {
      if (!clipId) return null;

      // Find jobs where settings.clip_id matches
      const { data, error } = await supabase
        .from("video_jobs")
        .select("*")
        .eq("script_run_id", scriptId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!data) return null;

      // Filter by clip_id in settings
      const clipJob = data.find((job) => {
        const settings = job.settings as Record<string, unknown> | null;
        return settings?.clip_id === clipId;
      });

      return clipJob || null;
    },
    refetchInterval: (query) => {
      const job = query.state.data;
      if (job && ACTIVE_STATUSES.includes(job.status)) {
        return 5000;
      }
      return false;
    },
  });
}

/**
 * Get video generation status summary for clips
 */
export function getClipVideoStatus(
  jobs: VideoJob[],
  clipId: string
): { status: "none" | "queued" | "running" | "done" | "failed"; job?: VideoJob } {
  const clipJobs = jobs.filter((job) => {
    const settings = job.settings as Record<string, unknown> | null;
    return settings?.clip_id === clipId;
  });

  if (clipJobs.length === 0) return { status: "none" };

  // Get the most recent job
  const latestJob = clipJobs[0];
  
  if (latestJob.status === "succeeded" || latestJob.status === "done") {
    return { status: "done", job: latestJob };
  }
  if (ACTIVE_STATUSES.includes(latestJob.status)) {
    return { status: latestJob.status === "queued" ? "queued" : "running", job: latestJob };
  }
  if (latestJob.status === "failed") {
    return { status: "failed", job: latestJob };
  }

  return { status: "none", job: latestJob };
}
