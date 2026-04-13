/**
 * Performance dashboard hook
 * 
 * Fetches prompt_outcomes joined with story_jobs to build
 * a unified performance view with winner/loser detection.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PerformanceEntry {
  id: string;
  story_job_id: string | null;
  experiment_id: string;
  title: string | null;
  product_id: string | null;
  product_name: string | null;
  platform: string | null;
  views: number | null;
  likes: number | null;
  shares: number | null;
  saves: number | null;
  comments: number | null;
  avg_watch_time: number | null;
  watch_3s_rate: number | null;
  outcome_score: number | null;
  created_at: string;
  assembled_video_url: string | null;
  signal: "winner" | "promising" | "neutral" | "underperformer" | "loser";
}

export interface PerformanceSummary {
  totalTracked: number;
  avgOutcomeScore: number;
  winners: number;
  losers: number;
  totalViews: number;
  totalEngagements: number;
  bestPlatform: string | null;
}

function classifySignal(score: number | null, views: number | null): PerformanceEntry["signal"] {
  if (score == null) return "neutral";
  if (score >= 70 && (views ?? 0) >= 1000) return "winner";
  if (score >= 50) return "promising";
  if (score >= 25) return "neutral";
  if (score >= 10) return "underperformer";
  return "loser";
}

export function usePerformanceDashboard() {
  return useQuery({
    queryKey: ["performance-dashboard"],
    queryFn: async (): Promise<{ entries: PerformanceEntry[]; summary: PerformanceSummary }> => {
      // Fetch outcomes
      const { data: outcomes, error: oErr } = await supabase
        .from("prompt_outcomes")
        .select("id, story_job_id, experiment_id, platform, views, likes, shares, saves, comments, avg_watch_time, watch_3s_rate, outcome_score, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (oErr) throw oErr;
      if (!outcomes || outcomes.length === 0) {
        return { entries: [], summary: { totalTracked: 0, avgOutcomeScore: 0, winners: 0, losers: 0, totalViews: 0, totalEngagements: 0, bestPlatform: null } };
      }

      // Get story_job details
      const jobIds = [...new Set(outcomes.map(o => o.story_job_id).filter(Boolean))] as string[];
      const jobMap = new Map<string, { title: string | null; product_id: string | null; assembled_video_url: string | null }>();

      if (jobIds.length > 0) {
        const { data: jobs } = await supabase
          .from("story_jobs")
          .select("id, title, product_id, assembled_video_url")
          .in("id", jobIds);
        jobs?.forEach(j => jobMap.set(j.id, { title: j.title, product_id: j.product_id, assembled_video_url: j.assembled_video_url }));
      }

      // Get product names
      const productIds = [...new Set([...jobMap.values()].map(j => j.product_id).filter(Boolean))] as string[];
      const productMap = new Map<string, string>();
      if (productIds.length > 0) {
        const { data: products } = await supabase.from("products").select("id, name").in("id", productIds);
        products?.forEach(p => productMap.set(p.id, p.name));
      }

      const entries: PerformanceEntry[] = outcomes.map(o => {
        const job = o.story_job_id ? jobMap.get(o.story_job_id) : null;
        const score = o.outcome_score != null ? Number(o.outcome_score) : null;
        const views = o.views != null ? Number(o.views) : null;
        return {
          id: o.id,
          story_job_id: o.story_job_id,
          experiment_id: o.experiment_id,
          title: job?.title ?? null,
          product_id: job?.product_id ?? null,
          product_name: job?.product_id ? productMap.get(job.product_id) ?? null : null,
          platform: o.platform,
          views,
          likes: o.likes != null ? Number(o.likes) : null,
          shares: o.shares != null ? Number(o.shares) : null,
          saves: o.saves != null ? Number(o.saves) : null,
          comments: o.comments != null ? Number(o.comments) : null,
          avg_watch_time: o.avg_watch_time != null ? Number(o.avg_watch_time) : null,
          watch_3s_rate: o.watch_3s_rate != null ? Number(o.watch_3s_rate) : null,
          outcome_score: score,
          created_at: o.created_at,
          assembled_video_url: job?.assembled_video_url ?? null,
          signal: classifySignal(score, views),
        };
      });

      // Summary
      const scored = entries.filter(e => e.outcome_score != null);
      const avgScore = scored.length > 0 ? Math.round(scored.reduce((s, e) => s + (e.outcome_score ?? 0), 0) / scored.length) : 0;
      const totalViews = entries.reduce((s, e) => s + (e.views ?? 0), 0);
      const totalEngagements = entries.reduce((s, e) => s + (e.likes ?? 0) + (e.shares ?? 0) + (e.saves ?? 0) + (e.comments ?? 0), 0);

      // Best platform
      const platformViews = new Map<string, number>();
      entries.forEach(e => {
        if (e.platform && e.views) {
          platformViews.set(e.platform, (platformViews.get(e.platform) ?? 0) + e.views);
        }
      });
      let bestPlatform: string | null = null;
      let bestViews = 0;
      platformViews.forEach((v, k) => { if (v > bestViews) { bestViews = v; bestPlatform = k; } });

      return {
        entries,
        summary: {
          totalTracked: entries.length,
          avgOutcomeScore: avgScore,
          winners: entries.filter(e => e.signal === "winner").length,
          losers: entries.filter(e => e.signal === "loser").length,
          totalViews,
          totalEngagements,
          bestPlatform,
        },
      };
    },
    staleTime: 30_000,
  });
}
