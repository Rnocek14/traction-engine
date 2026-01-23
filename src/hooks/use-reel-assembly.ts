import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";

// ============================================
// Types
// ============================================

export type AssemblyStatus = "none" | "queued" | "rendering" | "succeeded" | "failed";

export interface AssembleReelParams {
  scriptRunId: string;
  transitionType?: "cut" | "crossfade" | "fade" | "wipe";
  transitionDuration?: number;
  outputWidth?: number;
  outputHeight?: number;
  outputFps?: number;
}

export interface AssemblyResult {
  success: boolean;
  status: AssemblyStatus;
  output_url?: string;
  duration?: number;
  job_id?: string;
  eta_seconds?: number;
  error?: string;
}

export interface AssemblyMeta {
  started_at?: string;
  completed_at?: string;
  failed_at?: string;
  error?: string;
  clips_count?: number;
  expected_duration?: number;
  voiceover_available?: boolean;
  transition?: {
    type: string;
    duration: number;
  };
  output?: {
    width: number;
    height: number;
    fps: number;
  };
  ffmpeg_job_id?: string;
  ffmpeg_status?: string;
  eta_seconds?: number;
  duration?: number;
}

// ============================================
// Assembly Mutation Hook
// ============================================

/**
 * Hook for triggering reel assembly via FFmpeg service
 */
export function useAssembleReel() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: AssembleReelParams): Promise<AssemblyResult> => {
      const pipelineKey = import.meta.env.VITE_PIPELINE_KEY;

      const { data, error } = await supabase.functions.invoke<AssemblyResult>(
        "assemble-reel",
        {
          headers: pipelineKey ? { "x-pipeline-key": pipelineKey } : undefined,
          body: {
            script_run_id: params.scriptRunId,
            transition_type: params.transitionType || "crossfade",
            transition_duration: params.transitionDuration || 0.2,
            output_width: params.outputWidth || 1080,
            output_height: params.outputHeight || 1920,
            output_fps: params.outputFps || 30,
          },
        }
      );

      if (error) {
        throw new Error(error.message || "Failed to start assembly");
      }

      if (!data) {
        throw new Error("No response from assembly service");
      }

      if (!data.success && data.error) {
        throw new Error(data.error);
      }

      return data;
    },
    onSuccess: (result, params) => {
      if (result.status === "succeeded") {
        toast.success("Reel assembled successfully!", {
          description: `Duration: ${result.duration?.toFixed(1)}s`,
        });
      } else if (result.status === "queued" || result.status === "rendering") {
        toast.info("Assembly started", {
          description: result.eta_seconds
            ? `Estimated time: ${result.eta_seconds}s`
            : "Processing...",
        });
      }

      // Invalidate script run to refresh status
      queryClient.invalidateQueries({ queryKey: ["script-run", params.scriptRunId] });
      queryClient.invalidateQueries({ queryKey: ["assembly-status", params.scriptRunId] });
    },
    onError: (error) => {
      toast.error("Assembly failed", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    },
  });
}

// ============================================
// Assembly Status Query Hook
// ============================================

/**
 * Hook for polling assembly status
 */
export function useAssemblyStatus(scriptRunId: string | undefined) {
  return useQuery({
    queryKey: ["assembly-status", scriptRunId],
    queryFn: async () => {
      if (!scriptRunId) return null;

      const { data, error } = await supabase
        .from("script_runs")
        .select("assembled_status, assembled_video_url, assembled_at, assembled_meta")
        .eq("id", scriptRunId)
        .single();

      if (error) {
        console.error("Error fetching assembly status:", error);
        return null;
      }

      return {
        status: (data.assembled_status || "none") as AssemblyStatus,
        videoUrl: data.assembled_video_url as string | null,
        assembledAt: data.assembled_at as string | null,
        meta: data.assembled_meta as AssemblyMeta | null,
      };
    },
    enabled: !!scriptRunId,
    refetchInterval: (query) => {
      // Poll every 3 seconds while rendering
      const status = query.state.data?.status;
      if (status === "queued" || status === "rendering") {
        return 3000;
      }
      return false;
    },
    staleTime: 2000,
  });
}

// ============================================
// Assembly Controls Hook
// ============================================

/**
 * Combines assembly trigger + status polling for UI components
 */
export function useReelAssembly(scriptRunId: string | undefined) {
  const assembleMutation = useAssembleReel();
  const statusQuery = useAssemblyStatus(scriptRunId);

  const isAssembling =
    assembleMutation.isPending ||
    statusQuery.data?.status === "queued" ||
    statusQuery.data?.status === "rendering";

  const canAssemble =
    !!scriptRunId &&
    !isAssembling &&
    statusQuery.data?.status !== "rendering";

  const hasAssembledVideo =
    statusQuery.data?.status === "succeeded" &&
    !!statusQuery.data?.videoUrl;

  return {
    // Mutation
    assemble: (params?: Omit<AssembleReelParams, "scriptRunId">) => {
      if (!scriptRunId) return;
      return assembleMutation.mutateAsync({ scriptRunId, ...params });
    },
    assembleAsync: assembleMutation.mutateAsync,
    isPending: assembleMutation.isPending,
    error: assembleMutation.error,

    // Status
    status: statusQuery.data?.status || "none",
    videoUrl: statusQuery.data?.videoUrl,
    meta: statusQuery.data?.meta,
    isLoading: statusQuery.isLoading,

    // Computed
    isAssembling,
    canAssemble,
    hasAssembledVideo,
  };
}
