import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Clip } from "@/types/timeline-types";
import type { Tables } from "@/integrations/supabase/types";
import { 
  getProviderDuration, 
  isClipDurationTooShort,
  type VideoProvider 
} from "@/types/video-provider-types";

type VideoJob = Tables<"video_jobs">;

// Sora 2 constraints (for UI display - actual logic uses provider capabilities)
export type VideoSize = "720x1280" | "1280x720" | "1024x1792" | "1792x1024";
export type VideoDuration = 4 | 8 | 12;
export type QualityTier = "draft" | "standard" | "pro";

export const SIZE_OPTIONS: { value: VideoSize; label: string; aspectRatio: string }[] = [
  { value: "720x1280", label: "9:16 Vertical (720p)", aspectRatio: "9:16" },
  { value: "1280x720", label: "16:9 Landscape (720p)", aspectRatio: "16:9" },
  { value: "1024x1792", label: "9:16 Pro", aspectRatio: "9:16 Pro" },
  { value: "1792x1024", label: "16:9 Pro", aspectRatio: "16:9 Pro" },
];

export const DURATION_OPTIONS: { value: VideoDuration; label: string }[] = [
  { value: 4, label: "4 seconds" },
  { value: 8, label: "8 seconds" },
  { value: 12, label: "12 seconds" },
];

export interface QualityTierConfig {
  tier: QualityTier;
  label: string;
  model: string;
  seconds: VideoDuration;
  size: VideoSize;
  description: string;
}

export const QUALITY_TIERS: QualityTierConfig[] = [
  {
    tier: "draft",
    label: "Draft",
    model: "sora-2",
    seconds: 4,
    size: "720x1280",
    description: "Fast preview",
  },
  {
    tier: "standard",
    label: "Standard",
    model: "sora-2",
    seconds: 8,
    size: "720x1280",
    description: "Balanced",
  },
  {
    tier: "pro",
    label: "Pro",
    model: "sora-2-pro",
    seconds: 4,
    size: "1024x1792",
    description: "Best quality",
  },
];

export interface GenerateClipVideoParams {
  scriptId: string;
  clip: Clip;
  size?: VideoSize;
  /** 
   * Manual duration override. If not provided, uses clip.end - clip.start 
   * and maps to the optimal provider duration.
   */
  duration?: VideoDuration;
  promptOverride?: string;
  model?: string;
  seed?: number;
  provider?: VideoProvider;
}

export interface GenerateAllClipsParams {
  scriptId: string;
  clips: Clip[];
  size?: VideoSize;
  /** If not provided, each clip uses its own timeline duration */
  duration?: VideoDuration;
  model?: string;
  seed?: number;
  provider?: VideoProvider;
}

export interface GenerateChainedParams {
  scriptId: string;
  clipIds: string[];
  size?: VideoSize;
  duration?: VideoDuration;
  model?: string;
  seed?: number;
  resumeFromJobId?: string;
  provider?: VideoProvider;
}

const ACTIVE_STATUSES = ["queued", "running", "rendering"];

/**
 * Hook for generating video for a single clip.
 * Timeline duration (clip.end - clip.start) is the source of truth.
 */
export function useGenerateClipVideo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scriptId,
      clip,
      size = "720x1280",
      duration: manualDuration,
      promptOverride,
      model: modelOverride,
      seed,
      provider = "sora",
    }: GenerateClipVideoParams): Promise<VideoJob> => {
      // Timeline duration is the source of truth
      const timelineDuration = clip.end - clip.start;
      
      // If manual duration provided, use it; otherwise compute from timeline
      const requestedSeconds = manualDuration ?? timelineDuration;
      
      // Get the optimal provider duration bucket
      const { providerSeconds } = getProviderDuration(provider, requestedSeconds);
      
      // Warn if clip is too short
      if (isClipDurationTooShort(timelineDuration)) {
        console.warn(`Clip ${clip.id} is very short (${timelineDuration.toFixed(1)}s) - may produce poor results`);
      }

      const model = modelOverride || (size.startsWith("1024") || size.startsWith("1792") ? "sora-2-pro" : "sora-2");

      const { data, error } = await supabase.functions.invoke("queue-video", {
        body: {
          script_run_id: scriptId,
          clip_id: clip.id,
          prompt: promptOverride || clip.prompt,
          provider,
          settings: {
            size,
            // Pass both durations - provider_seconds for API, requested_seconds for trim
            provider_seconds: providerSeconds,
            requested_seconds: requestedSeconds,
            // Legacy field for backwards compat (will be removed)
            seconds: providerSeconds,
            model,
            seed,
          },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to queue video");

      return data.job;
    },
    onSuccess: (job, variables) => {
      const settings = job.settings as Record<string, unknown> | null;
      const requested = settings?.requested_seconds as number | undefined;
      const provider = settings?.provider_seconds as number | undefined;
      
      const desc = requested && provider && requested !== provider
        ? `Generating ${provider}s, will trim to ${requested.toFixed(1)}s`
        : `Clip queued for rendering`;
      
      toast({
        title: "Video generation started",
        description: desc,
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
 * Hook for generating videos for all clips in batch.
 * Each clip uses its own timeline duration unless overridden.
 */
export function useGenerateAllClipsVideo() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scriptId,
      clips,
      size = "720x1280",
      duration: globalDuration,
      model: modelOverride,
      provider = "sora",
    }: GenerateAllClipsParams): Promise<{ queued: number; failed: number; jobs: VideoJob[] }> => {
      const model = modelOverride || (size.startsWith("1024") || size.startsWith("1792") ? "sora-2-pro" : "sora-2");
      
      const results = await Promise.allSettled(
        clips
          .filter(c => c.type === "video" && c.prompt && !c.disabled)
          .map(async (clip) => {
            // Each clip uses its own timeline duration, or global override
            const timelineDuration = clip.end - clip.start;
            const requestedSeconds = globalDuration ?? timelineDuration;
            const { providerSeconds } = getProviderDuration(provider, requestedSeconds);

            const { data, error } = await supabase.functions.invoke("queue-video", {
              body: {
                script_run_id: scriptId,
                clip_id: clip.id,
                prompt: clip.prompt,
                provider,
                settings: {
                  size,
                  provider_seconds: providerSeconds,
                  requested_seconds: requestedSeconds,
                  seconds: providerSeconds, // Legacy
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
 * Hook for generating videos sequentially with frame chaining for visual continuity.
 * Each clip uses the last frame of the previous clip as its starting frame.
 */
export function useGenerateChainedSequence() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      scriptId,
      clipIds,
      size = "720x1280",
      duration = 4,
      model: modelOverride,
      seed,
      resumeFromJobId,
    }: GenerateChainedParams): Promise<{ succeeded: number; failed: number; skipped?: number; resumeJobId?: string | null }> => {
      const model = modelOverride || (size.startsWith("1024") || size.startsWith("1792") ? "sora-2-pro" : "sora-2");

      const { data, error } = await supabase.functions.invoke("generate-reel-sequence", {
        body: {
          script_run_id: scriptId,
          clip_ids: clipIds,
          settings: {
            size,
            seconds: duration,
            model,
            seed,
          },
          resume_from_job_id: resumeFromJobId,
        },
      });

      if (error) throw error;
      if (!data?.success && data?.summary?.succeeded === 0) throw new Error(data?.error || "Failed to start sequence");

      return {
        succeeded: data.summary.succeeded,
        failed: data.summary.failed,
        skipped: data.summary.skipped,
        resumeJobId: data.summary.resume_job_id,
      };
    },
    onSuccess: (result, variables) => {
      const parts = [`${result.succeeded} clips generated`];
      if (result.failed && result.failed > 0) parts.push(`${result.failed} failed`);
      if (result.skipped && result.skipped > 0) parts.push(`${result.skipped} skipped`);
      
      toast({
        title: result.failed === 0 && (result.skipped || 0) === 0 
          ? "Chained sequence complete" 
          : "Chained sequence partially complete",
        description: parts.join(", "),
        variant: result.failed && result.failed > 0 ? "destructive" : "default",
      });
      queryClient.invalidateQueries({ queryKey: ["video-jobs", variables.scriptId] });
    },
    onError: (error) => {
      toast({
        title: "Sequence generation failed",
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
