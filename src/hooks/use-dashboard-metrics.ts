/**
 * Dashboard metrics hook - real data from Supabase
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DashboardMetrics {
  totalStories: number;
  storiesByStatus: Record<string, number>;
  videosToday: number;
  videosCompleted: number;
  videosRunning: number;
  videosFailed: number;
  totalScripts: number;
  scriptsQAPassed: number;
  scriptsQAFailed: number;
  assemblySuccessRate: number;
  pipelineCounts: {
    script: number;
    voice: number;
    video: number;
    assembly: number;
    published: number;
  };
}

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ["dashboard-metrics"],
    queryFn: async (): Promise<DashboardMetrics> => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();

      // Parallel queries
      const [storiesRes, videosRes, videosTodayRes, scriptsRes, assembledRes] = await Promise.all([
        // All stories
        supabase.from("story_jobs").select("id, status"),
        // All video jobs
        supabase.from("video_jobs").select("id, status, created_at"),
        // Videos created today
        supabase.from("video_jobs").select("id, status").gte("created_at", todayISO),
        // Scripts
        supabase.from("script_runs").select("id, status, voiceover_generated_at, assembled_status"),
        // Assembled stories
        supabase.from("story_jobs").select("id, assembled_status").neq("assembled_status", "none"),
      ]);

      const stories = storiesRes.data || [];
      const videos = videosRes.data || [];
      const videosToday = videosTodayRes.data || [];
      const scripts = scriptsRes.data || [];
      const assembled = assembledRes.data || [];

      // Story status counts
      const storiesByStatus: Record<string, number> = {};
      stories.forEach(s => {
        storiesByStatus[s.status] = (storiesByStatus[s.status] || 0) + 1;
      });

      // Video counts
      const videosCompleted = videos.filter(v => v.status === "done").length;
      const videosRunning = videos.filter(v => v.status === "running" || v.status === "queued").length;
      const videosFailed = videos.filter(v => v.status === "error" || v.status === "failed").length;

      // Script counts
      const scriptsQAPassed = scripts.filter(s => s.status === "qa_passed").length;
      const scriptsQAFailed = scripts.filter(s => s.status === "qa_failed").length;

      // Assembly success rate
      const assembledTotal = assembled.length;
      const assembledSuccess = assembled.filter(a => a.assembled_status === "done").length;
      const assemblySuccessRate = assembledTotal > 0 ? Math.round((assembledSuccess / assembledTotal) * 100) : 0;

      // Pipeline counts - approximate from real data
      const scriptsWithVoiceover = scripts.filter(s => s.voiceover_generated_at).length;
      const pipelineCounts = {
        script: scripts.length,
        voice: scriptsWithVoiceover,
        video: videosCompleted,
        assembly: assembledSuccess,
        published: stories.filter(s => storiesByStatus["published"]).length, // placeholder
      };

      return {
        totalStories: stories.length,
        storiesByStatus,
        videosToday: videosToday.length,
        videosCompleted,
        videosRunning,
        videosFailed,
        totalScripts: scripts.length,
        scriptsQAPassed,
        scriptsQAFailed,
        assemblySuccessRate,
        pipelineCounts,
      };
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
