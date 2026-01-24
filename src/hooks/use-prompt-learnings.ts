import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Provider = "sora" | "runway" | "luma" | "all";

export interface PatternLearning {
  id: string;
  provider: string;
  pattern_type: string;
  pattern_value: string;
  total_uses: number;
  successful_uses: number;
  failed_uses: number;
  average_rating: number | null;
  avoid_pattern: boolean;
  last_success_at: string | null;
  last_failure_at: string | null;
  example_prompts: string[] | null;
}

export interface ProviderStats {
  provider: string;
  total_patterns: number;
  avoided_count: number;
  avg_rating: number;
  total_successes: number;
  total_failures: number;
}

// Time decay function matching edge function logic
function calculateTimeDecay(lastSuccessAt: string | null): number {
  if (!lastSuccessAt) return 0.5;
  
  const daysSince = (Date.now() - new Date(lastSuccessAt).getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSince <= 7) return 1.0;
  if (daysSince <= 14) return 0.9;
  if (daysSince <= 30) return 0.75;
  if (daysSince <= 60) return 0.5;
  return 0.25;
}

// Calculate effective score with time decay
export function calculateEffectiveScore(pattern: PatternLearning): number {
  const baseScore = pattern.average_rating || 0;
  const usageBoost = Math.log(pattern.successful_uses + 1);
  const timeDecay = calculateTimeDecay(pattern.last_success_at);
  return baseScore * usageBoost * timeDecay;
}

export function usePromptLearnings(provider: Provider) {
  return useQuery({
    queryKey: ["prompt-learnings", provider],
    queryFn: async () => {
      let query = supabase
        .from("prompt_learnings")
        .select("*")
        .order("successful_uses", { ascending: false });

      if (provider !== "all") {
        query = query.eq("provider", provider);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      
      // Calculate effective scores and sort
      const withScores = (data || []).map(pattern => ({
        ...pattern,
        effectiveScore: calculateEffectiveScore(pattern as PatternLearning),
      }));
      
      withScores.sort((a, b) => b.effectiveScore - a.effectiveScore);
      
      return withScores;
    },
    refetchInterval: 30000, // Refresh every 30s
  });
}

export function useProviderStats() {
  return useQuery({
    queryKey: ["provider-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prompt_learnings")
        .select("provider, avoid_pattern, average_rating, successful_uses, failed_uses");

      if (error) throw error;

      // Aggregate stats by provider
      const statsMap = new Map<string, ProviderStats>();
      
      for (const row of data || []) {
        const existing = statsMap.get(row.provider) || {
          provider: row.provider,
          total_patterns: 0,
          avoided_count: 0,
          avg_rating: 0,
          total_successes: 0,
          total_failures: 0,
        };
        
        existing.total_patterns++;
        if (row.avoid_pattern) existing.avoided_count++;
        existing.total_successes += row.successful_uses;
        existing.total_failures += row.failed_uses;
        existing.avg_rating += row.average_rating || 0;
        
        statsMap.set(row.provider, existing);
      }
      
      // Calculate averages
      const stats = Array.from(statsMap.values()).map(s => ({
        ...s,
        avg_rating: s.total_patterns > 0 ? s.avg_rating / s.total_patterns : 0,
      }));
      
      return stats.sort((a, b) => b.total_successes - a.total_successes);
    },
    refetchInterval: 30000,
  });
}
