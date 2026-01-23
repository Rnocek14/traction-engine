import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Clip } from "@/types/timeline-types";
import type { Tables } from "@/integrations/supabase/types";

type VideoJob = Tables<"video_jobs">;

export interface RegenerateClipParams {
  clip: Clip;
  scriptId: string;
  newPrompt?: string;
  style?: string;
  keepDuration?: boolean;
  size?: string;
  durationSeconds?: number;
}

export interface ExtendClipParams {
  clip: Clip;
  scriptId: string;
  additionalSeconds: number;
  continuationPrompt?: string;
}

/**
 * Hook for clip-level video regeneration
 */
export function useRegenerateClip() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clip,
      scriptId,
      newPrompt,
      style,
      size = "1920x1080",
      durationSeconds = 4,
    }: RegenerateClipParams): Promise<VideoJob> => {
      const prompt = newPrompt || clip.prompt || "";
      const styledPrompt = style
        ? `[${style.toUpperCase()} STYLE] ${prompt}`
        : prompt;

      // Create a new video job for this clip
      const { data, error } = await supabase.functions.invoke("queue-video", {
        body: {
          script_run_id: scriptId,
          provider: "sora",
          settings: {
            prompt: styledPrompt,
            size,
            duration_seconds: durationSeconds,
            clip_id: clip.id, // Track which clip this is for
            regeneration: true,
            original_clip_id: clip.id,
          },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to queue video");

      return data.job;
    },
    onSuccess: (job, variables) => {
      toast({
        title: "Clip regeneration started",
        description: `Job ${job.id.slice(0, 8)} queued`,
      });
      queryClient.invalidateQueries({ queryKey: ["video-jobs", variables.scriptId] });
    },
    onError: (error) => {
      toast({
        title: "Regeneration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for extending/continuing video from last frame
 */
export function useExtendClip() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      clip,
      scriptId,
      additionalSeconds,
      continuationPrompt,
    }: ExtendClipParams): Promise<VideoJob> => {
      // Build continuation prompt
      const basePrompt = clip.prompt || "";
      const prompt = continuationPrompt
        ? `Continue seamlessly: ${continuationPrompt}`
        : `Continue seamlessly from the previous scene: ${basePrompt.slice(0, 100)}...`;

      // Try to get the last frame reference if we have a video job
      let referenceFrameUrl: string | undefined;
      if (clip.source?.video_job_id) {
        const { data: job } = await supabase
          .from("video_jobs")
          .select("thumbnail_url, output_url")
          .eq("id", clip.source.video_job_id)
          .single();

        // Use thumbnail as reference frame (ideally we'd extract last frame)
        referenceFrameUrl = job?.thumbnail_url || undefined;
      }

      // Create continuation video job
      const { data, error } = await supabase.functions.invoke("queue-video", {
        body: {
          script_run_id: scriptId,
          provider: "sora",
          settings: {
            prompt,
            size: clip.settings?.size || "1920x1080",
            duration_seconds: additionalSeconds,
            continuation: true,
            continue_from_clip_id: clip.id,
            reference_frame_url: referenceFrameUrl,
          },
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to queue extension");

      return data.job;
    },
    onSuccess: (job, variables) => {
      toast({
        title: "Extension started",
        description: `Adding ${variables.additionalSeconds}s continuation`,
      });
      queryClient.invalidateQueries({ queryKey: ["video-jobs", variables.scriptId] });
    },
    onError: (error) => {
      toast({
        title: "Extension failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

/**
 * Hook for managing alt takes on a clip
 */
export function useClipTakes(scriptId: string, clipId: string) {
  const queryClient = useQueryClient();

  // Fetch all video jobs for this clip
  const { data: takes = [], isLoading } = {
    data: [] as VideoJob[],
    isLoading: false,
  };

  // In a real implementation, we'd query video_jobs filtered by clip_id in settings
  // For now, this is a placeholder that would be expanded

  const setActiveTake = useMutation({
    mutationFn: async (takeId: string) => {
      // This would update the clip's active_take_id in the timeline
      // For now just invalidate to refresh
      return takeId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["studio-timeline", scriptId] });
    },
  });

  return {
    takes,
    isLoading,
    setActiveTake: setActiveTake.mutate,
    isSettingTake: setActiveTake.isPending,
  };
}
