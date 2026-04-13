/**
 * Ideas workspace data hook
 * Pulls trend intelligence, idea lineage, and performance data
 */
import { useQuery } from "@tanstack/react-query";
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

export interface IdeaLineage {
  id: string;
  title: string | null;
  account_id: string;
  story_type: string;
  status: string;
  review_status: string;
  created_at: string;
  // Prompt lineage
  topic_experiment_id: string | null;
  script_experiment_id: string | null;
  hook_experiment_id: string | null;
  visual_experiment_id: string | null;
  // Production status
  total_clips: number | null;
  completed_clips: number | null;
  continuity_score: number | null;
  assembled_status: string | null;
  assembled_video_url: string | null;
  // Enrichment metadata (from experiment input_context)
  enrichment?: {
    used_scraped_insights?: boolean;
    scraped_insight_ids?: string[];
    hook_patterns?: string[];
    emotional_triggers?: string[];
  };
  // Performance
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

export function useIdeaLineage(limit = 50) {
  return useQuery({
    queryKey: ["idea-lineage", limit],
    queryFn: async () => {
      // Get stories with experiment IDs
      const { data: stories, error: storiesErr } = await supabase
        .from("story_jobs")
        .select("id, title, account_id, story_type, status, review_status, created_at, topic_experiment_id, script_experiment_id, hook_experiment_id, visual_experiment_id, total_clips, completed_clips, continuity_score, assembled_status, assembled_video_url")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (storiesErr) throw storiesErr;
      if (!stories || stories.length === 0) return [];

      // Collect experiment IDs to fetch enrichment context
      const scriptExpIds = stories
        .map(s => s.script_experiment_id)
        .filter(Boolean) as string[];

      let enrichmentMap: Record<string, IdeaLineage["enrichment"]> = {};
      if (scriptExpIds.length > 0) {
        const { data: exps } = await supabase
          .from("prompt_experiments")
          .select("id, input_context")
          .in("id", scriptExpIds);
        if (exps) {
          for (const exp of exps) {
            const ctx = exp.input_context as Record<string, unknown>;
            enrichmentMap[exp.id] = {
              used_scraped_insights: ctx?.used_scraped_insights as boolean,
              scraped_insight_ids: ctx?.scraped_insight_ids as string[],
              hook_patterns: ctx?.hook_patterns as string[],
              emotional_triggers: ctx?.emotional_triggers as string[],
            };
          }
        }
      }

      // Fetch outcomes for stories that have experiments
      let outcomeMap: Record<string, number> = {};
      if (scriptExpIds.length > 0) {
        const { data: outcomes } = await supabase
          .from("prompt_outcomes")
          .select("experiment_id, outcome_score")
          .in("experiment_id", scriptExpIds);
        if (outcomes) {
          for (const o of outcomes) {
            if (o.outcome_score != null) {
              outcomeMap[o.experiment_id] = Number(o.outcome_score);
            }
          }
        }
      }

      return stories.map(s => ({
        ...s,
        enrichment: s.script_experiment_id ? enrichmentMap[s.script_experiment_id] : undefined,
        outcome_score: s.script_experiment_id ? outcomeMap[s.script_experiment_id] ?? null : null,
      })) as IdeaLineage[];
    },
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useTrendStats() {
  return useQuery({
    queryKey: ["trend-stats"],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      const [insightsRes, storiesRes] = await Promise.all([
        supabase
          .from("scraped_insights")
          .select("id, viral_score, hook_patterns, emotional_triggers, content_format")
          .gte("created_at", sevenDaysAgo),
        supabase
          .from("story_jobs")
          .select("id, status, review_status, assembled_status")
          .gte("created_at", sevenDaysAgo),
      ]);

      const insights = insightsRes.data || [];
      const stories = storiesRes.data || [];

      // Aggregate hook patterns
      const hookCounts: Record<string, number> = {};
      const emotionCounts: Record<string, number> = {};
      const formatCounts: Record<string, number> = {};

      for (const i of insights) {
        for (const h of (i.hook_patterns || [])) {
          hookCounts[h] = (hookCounts[h] || 0) + 1;
        }
        for (const e of (i.emotional_triggers || [])) {
          emotionCounts[e] = (emotionCounts[e] || 0) + 1;
        }
        if (i.content_format) {
          formatCounts[i.content_format] = (formatCounts[i.content_format] || 0) + 1;
        }
      }

      const topHooks = Object.entries(hookCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const topEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const topFormats = Object.entries(formatCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

      const avgViralScore = insights.length > 0
        ? Math.round(insights.reduce((sum, i) => sum + (i.viral_score || 0), 0) / insights.length)
        : 0;

      return {
        totalInsights: insights.length,
        avgViralScore,
        topHooks,
        topEmotions,
        topFormats,
        storiesThisWeek: stories.length,
        storiesProduced: stories.filter(s => s.assembled_status === "done" || s.assembled_status === "succeeded").length,
        storiesApproved: stories.filter(s => s.review_status === "approved").length,
      };
    },
    staleTime: 60_000,
  });
}
