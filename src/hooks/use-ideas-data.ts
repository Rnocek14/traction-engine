/**
 * Ideas workspace data hook
 * Pulls trend intelligence, content ideas, and lineage data
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface TrendSignal {
  id: string;
  title: string | null;
  topics: string[];
  hook_patterns: string[];
  emotional_triggers: string[];
  content_format: string | null;
  viral_score: number | null;
  created_at: string;
  source_url: string;
}

export interface ContentIdea {
  id: string;
  account_id: string;
  title: string;
  subject: string;
  angle: string | null;
  vertical: string | null;
  suggested_hook_type: string | null;
  suggested_format: string | null;
  emotional_triggers: string[];
  trend_source_ids: string[];
  reasoning: string | null;
  opportunity_score: number;
  status: string;
  story_job_id: string | null;
  generated_by: string;
  created_at: string;
}

export interface IdeaLineage {
  id: string;
  title: string | null;
  account_id: string;
  story_type: string;
  status: string;
  review_status: string;
  created_at: string;
  topic_experiment_id: string | null;
  script_experiment_id: string | null;
  hook_experiment_id: string | null;
  visual_experiment_id: string | null;
  total_clips: number | null;
  completed_clips: number | null;
  continuity_score: number | null;
  assembled_status: string | null;
  assembled_video_url: string | null;
  enrichment?: {
    used_scraped_insights?: boolean;
    scraped_insight_ids?: string[];
    hook_patterns?: string[];
    emotional_triggers?: string[];
  };
  outcome_score?: number | null;
}

export function useTrendSignals() {
  return useQuery({
    queryKey: ["trend-signals"],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("scraped_insights")
        .select("id, title, topics, hook_patterns, emotional_triggers, content_format, viral_score, created_at, source_url")
        .gte("created_at", sevenDaysAgo)
        .order("viral_score", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as TrendSignal[];
    },
    staleTime: 60_000,
  });
}

export function useContentIdeas(statusFilter?: string) {
  return useQuery({
    queryKey: ["content-ideas", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("content_ideas")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (statusFilter && statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as ContentIdea[];
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useUpdateIdeaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("content_ideas")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-ideas"] });
    },
  });
}

export function useGenerateIdeas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { account_id?: string; vertical?: string; count?: number; mode?: string }) => {
      const { data, error } = await supabase.functions.invoke("generate-ideas", {
        body: params,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["content-ideas"] });
    },
  });
}

export function useIdeaLineage(limit = 50) {
  return useQuery({
    queryKey: ["idea-lineage", limit],
    queryFn: async () => {
      const { data: stories, error } = await supabase
        .from("story_jobs")
        .select("id, title, account_id, story_type, status, review_status, created_at, topic_experiment_id, script_experiment_id, hook_experiment_id, visual_experiment_id, total_clips, completed_clips, continuity_score, assembled_status, assembled_video_url")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (stories || []) as IdeaLineage[];
    },
    staleTime: 30_000,
  });
}

export function useTrendStats() {
  return useQuery({
    queryKey: ["trend-stats"],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const [insightsRes, ideasRes] = await Promise.all([
        supabase
          .from("scraped_insights")
          .select("id, viral_score, hook_patterns, emotional_triggers, content_format")
          .gte("created_at", sevenDaysAgo),
        supabase
          .from("content_ideas")
          .select("id, status, opportunity_score"),
      ]);

      const insights = insightsRes.data || [];
      const ideas = ideasRes.data || [];

      const hookCounts: Record<string, number> = {};
      const emotionCounts: Record<string, number> = {};
      const formatCounts: Record<string, number> = {};

      for (const i of insights) {
        for (const h of (i.hook_patterns || [])) hookCounts[h] = (hookCounts[h] || 0) + 1;
        for (const e of (i.emotional_triggers || [])) emotionCounts[e] = (emotionCounts[e] || 0) + 1;
        if (i.content_format) formatCounts[i.content_format] = (formatCounts[i.content_format] || 0) + 1;
      }

      return {
        totalInsights: insights.length,
        avgViralScore: insights.length > 0
          ? Math.round(insights.reduce((s, i) => s + (i.viral_score || 0), 0) / insights.length)
          : 0,
        topHooks: Object.entries(hookCounts).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][],
        topEmotions: Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][],
        topFormats: Object.entries(formatCounts).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][],
        totalIdeas: ideas.length,
        proposedIdeas: ideas.filter(i => i.status === "proposed").length,
        approvedIdeas: ideas.filter(i => i.status === "approved").length,
        producedIdeas: ideas.filter(i => i.status === "produced").length,
      };
    },
    staleTime: 60_000,
  });
}
