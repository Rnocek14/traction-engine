/**
 * Scraper health & intelligence metrics hook
 * Gives the operator full visibility into the trend pipeline
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ScraperHealth {
  // Volume
  totalInsights: number;
  insightsLast24h: number;
  insightsLast7d: number;
  totalScrapeJobs: number;
  failedJobs: number;
  lastScrapeAt: string | null;

  // Source diversity
  sourceCounts: { type: string; count: number }[];

  // Vertical coverage
  verticalCounts: { vertical: string; count: number }[];

  // Score distribution
  scoreDistribution: { bucket: string; count: number }[];
  minScore: number;
  maxScore: number;
  avgScore: number;
  medianScore: number;

  // Freshness
  oldestInsightAge: string | null;
  newestInsightAge: string | null;
  avgAgeHours: number;

  // Top patterns
  topHookTypes: { name: string; count: number }[];
  topEmotions: { name: string; count: number }[];
  topFormats: { name: string; count: number }[];
  topTopics: { name: string; count: number }[];

  // Actual trending stories
  trendingStories: {
    id: string;
    title: string | null;
    viral_score: number;
    source_type: string;
    content_format: string | null;
    topics: string[];
    emotional_triggers: string[];
    created_at: string;
    source_url?: string;
  }[];
}

export function useScraperHealth() {
  return useQuery({
    queryKey: ["scraper-health"],
    queryFn: async (): Promise<ScraperHealth> => {
      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Parallel fetches
      const [allInsights, recentInsights, scrapeJobs, topStories] = await Promise.all([
        supabase
          .from("scraped_insights")
          .select("id, viral_score, source_type, relevance_tags, hook_patterns, emotional_triggers, content_format, topics, created_at")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("scraped_insights")
          .select("id")
          .gte("created_at", oneDayAgo),
        supabase
          .from("scrape_jobs")
          .select("id, status, completed_at")
          .order("completed_at", { ascending: false })
          .limit(200),
      ]);

      const insights = allInsights.data || [];
      const recent24h = recentInsights.data || [];
      const jobs = scrapeJobs.data || [];

      // Recent 7d
      const insights7d = insights.filter(i => i.created_at >= sevenDaysAgo);

      // Source diversity
      const srcMap: Record<string, number> = {};
      for (const i of insights) srcMap[i.source_type] = (srcMap[i.source_type] || 0) + 1;
      const sourceCounts = Object.entries(srcMap)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      // Vertical coverage from relevance_tags
      const vertMap: Record<string, number> = {};
      for (const i of insights) {
        const tags: string[] = (i.relevance_tags as string[]) || [];
        for (const t of tags) vertMap[t.toLowerCase()] = (vertMap[t.toLowerCase()] || 0) + 1;
      }
      const verticalCounts = Object.entries(vertMap)
        .map(([vertical, count]) => ({ vertical, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

      // Score distribution
      const scores = insights.map(i => i.viral_score || 0).filter(s => s > 0);
      const buckets: Record<string, number> = { "0-30": 0, "31-50": 0, "51-70": 0, "71-85": 0, "86-100": 0 };
      for (const s of scores) {
        if (s <= 30) buckets["0-30"]++;
        else if (s <= 50) buckets["31-50"]++;
        else if (s <= 70) buckets["51-70"]++;
        else if (s <= 85) buckets["71-85"]++;
        else buckets["86-100"]++;
      }
      const scoreDistribution = Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
      const sortedScores = [...scores].sort((a, b) => a - b);

      // Freshness
      const ages = insights.map(i => (now.getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60));
      const avgAgeHours = ages.length > 0 ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;

      // Pattern counts
      const hookMap: Record<string, number> = {};
      const emotionMap: Record<string, number> = {};
      const formatMap: Record<string, number> = {};
      const topicMap: Record<string, number> = {};

      for (const i of insights) {
        for (const h of ((i.hook_patterns as string[]) || [])) {
          // Try to extract hook type if it's structured like "type: example"
          const short = h.length > 60 ? h.substring(0, 50) + "..." : h;
          hookMap[short] = (hookMap[short] || 0) + 1;
        }
        for (const e of ((i.emotional_triggers as string[]) || [])) emotionMap[e] = (emotionMap[e] || 0) + 1;
        if (i.content_format) formatMap[i.content_format] = (formatMap[i.content_format] || 0) + 1;
        for (const t of ((i.topics as string[]) || [])) topicMap[t] = (topicMap[t] || 0) + 1;
      }

      const toSorted = (m: Record<string, number>, limit = 8) =>
        Object.entries(m).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);

      // Scrape job stats
      const failedJobs = jobs.filter(j => j.status === "failed").length;
      const lastCompleted = jobs.find(j => j.status === "done" && j.completed_at);

      const stories = (topStories.data || []).map(s => ({
        id: s.id,
        title: s.title,
        viral_score: s.viral_score || 0,
        source_type: s.source_type,
        content_format: s.content_format,
        topics: (s.topics as string[]) || [],
        emotional_triggers: (s.emotional_triggers as string[]) || [],
        created_at: s.created_at,
        source_url: s.source_url,
      }));

      return {
        totalInsights: insights.length,
        insightsLast24h: recent24h.length,
        insightsLast7d: insights7d.length,
        totalScrapeJobs: jobs.length,
        failedJobs,
        lastScrapeAt: lastCompleted?.completed_at || null,

        sourceCounts,
        verticalCounts,

        scoreDistribution,
        minScore: sortedScores[0] || 0,
        maxScore: sortedScores[sortedScores.length - 1] || 0,
        avgScore: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        medianScore: sortedScores.length > 0 ? sortedScores[Math.floor(sortedScores.length / 2)] : 0,

        oldestInsightAge: insights.length > 0 ? insights[insights.length - 1].created_at : null,
        newestInsightAge: insights.length > 0 ? insights[0].created_at : null,
        avgAgeHours,

        topHookTypes: toSorted(hookMap),
        topEmotions: toSorted(emotionMap),
        topFormats: toSorted(formatMap),
        topTopics: toSorted(topicMap, 12),
        trendingStories: stories,
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
