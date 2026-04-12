import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAssembledVideos() {
  return useQuery({
    queryKey: ["assembled-videos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_jobs")
        .select("id, title, story_type, assembled_status, assembled_video_url, assembled_at, total_clips, continuity_score, account_id, status")
        .in("assembled_status", ["succeeded", "rendering", "queued", "failed"])
        .order("assembled_at", { ascending: false, nullsFirst: false });

      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15000, // poll every 15s for rendering updates
  });
}
