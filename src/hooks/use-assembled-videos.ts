import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type EnrichmentMeta = {
  used: boolean;
  hooks: string[];
  emotions: string[];
  format: string | null;
  insight_ids: string[];
};

export type ConfidenceScore = {
  overall: number; // 0-10
  continuity: number; // 0-10
  enrichment: number; // 0-10
  quality: number; // 0-10
  completion: number; // 0-10
  level: "high" | "medium" | "low";
};

type AssembledVideoRow = {
  id: string;
  title: string | null;
  story_type: string;
  assembled_status: string | null;
  assembled_video_url: string | null;
  assembled_at: string | null;
  assembled_meta: Record<string, unknown> | null;
  total_clips: number | null;
  completed_clips: number | null;
  continuity_score: number | null;
  account_id: string;
  status: string;
  script_experiment_id: string | null;
  enrichment?: EnrichmentMeta;
  confidence?: ConfidenceScore;
};

type AssemblyPollResponse = {
  success?: boolean;
  status?: string;
  output_url?: string | null;
  progress?: number;
  eta_seconds?: number;
  error?: string;
  duration?: number;
};

export function useAssembledVideos() {
  return useQuery({
    queryKey: ["assembled-videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_jobs")
        .select("id, title, story_type, assembled_status, assembled_video_url, assembled_at, assembled_meta, total_clips, completed_clips, continuity_score, account_id, status, script_experiment_id")
        .in("assembled_status", ["succeeded", "rendering", "queued", "failed"])
        .order("updated_at", { ascending: false });

      if (error) throw error;

      let rows = (data ?? []) as AssembledVideoRow[];

      // Fetch enrichment metadata from linked experiments
      const expIds = rows.map(r => r.script_experiment_id).filter(Boolean) as string[];
      if (expIds.length > 0) {
        const { data: expData } = await supabase
          .from("prompt_experiments")
          .select("id, input_context")
          .in("id", expIds);

        if (expData) {
          const expMap = new Map<string, Record<string, unknown>>();
          for (const e of expData) {
            expMap.set(e.id, (e.input_context ?? {}) as Record<string, unknown>);
          }
          rows = rows.map(row => {
            if (!row.script_experiment_id) return row;
            const ctx = expMap.get(row.script_experiment_id);
            if (!ctx) return row;
            return {
              ...row,
              enrichment: {
                used: ctx.used_scraped_insights === true,
                hooks: (ctx.enrichment_hooks as string[]) || [],
                emotions: (ctx.enrichment_emotions as string[]) || [],
                format: (ctx.enrichment_format as string) || null,
                insight_ids: (ctx.scraped_insight_ids as string[]) || [],
              },
            };
          });
        }
      }

      
      const activeRows = rows.filter(
        (row) => row.assembled_status === "queued" || row.assembled_status === "rendering"
      );

      if (activeRows.length === 0) return rows;

      const updatedRows = await Promise.all(
        rows.map(async (row) => {
          if (row.assembled_status !== "queued" && row.assembled_status !== "rendering") {
            return row;
          }

          try {
            const { data: pollData, error: pollError } = await supabase.functions.invoke<AssemblyPollResponse>(
              "poll-assembly-status",
              {
                body: { story_job_id: row.id },
              }
            );

            if (pollError || !pollData) {
              return row;
            }

            return {
              ...row,
              assembled_status: pollData.status ?? row.assembled_status,
              assembled_video_url: pollData.output_url ?? row.assembled_video_url,
              assembled_meta: {
                ...(row.assembled_meta ?? {}),
                ...(pollData.progress != null ? { progress: pollData.progress } : {}),
                ...(pollData.eta_seconds != null ? { eta_seconds: pollData.eta_seconds } : {}),
                ...(pollData.error ? { error: pollData.error } : {}),
                ...(pollData.duration != null ? { duration: pollData.duration } : {}),
                ...(pollData.status ? { ffmpeg_status: pollData.status } : {}),
              },
            };
          } catch {
            return row;
          }
        })
      );

      return updatedRows;
    },
    refetchInterval: (query) => {
      const videos = query.state.data as AssembledVideoRow[] | undefined;
      const hasActiveAssembly = videos?.some(
        (video) => video.assembled_status === "queued" || video.assembled_status === "rendering"
      );

      return hasActiveAssembly ? 3000 : 15000;
    },
    staleTime: 2000,
  });
}
