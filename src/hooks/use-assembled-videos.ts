import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type AssembledVideoRow = {
  id: string;
  title: string | null;
  story_type: string;
  assembled_status: string | null;
  assembled_video_url: string | null;
  assembled_at: string | null;
  assembled_meta: Record<string, unknown> | null;
  total_clips: number | null;
  continuity_score: number | null;
  account_id: string;
  status: string;
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
        .select("id, title, story_type, assembled_status, assembled_video_url, assembled_at, assembled_meta, total_clips, continuity_score, account_id, status")
        .in("assembled_status", ["succeeded", "rendering", "queued", "failed"])
        .order("updated_at", { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as AssembledVideoRow[];
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
