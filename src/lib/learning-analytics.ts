/**
 * Prompt Learning Analytics Helpers
 * 
 * SQL queries and utilities for monitoring the learning system
 */

// ============================================================
// MONITORING QUERIES - Run these in Supabase SQL Editor
// ============================================================

export const LEARNING_QUERIES = {
  // Overview: Pattern distribution by provider and type
  PATTERN_OVERVIEW: `
    SELECT 
      provider,
      pattern_type,
      COUNT(*) as pattern_count,
      ROUND(AVG(average_rating)::numeric, 2) as mean_rating,
      SUM(successful_uses) as total_successes,
      SUM(failed_uses) as total_failures
    FROM prompt_learnings
    GROUP BY provider, pattern_type
    ORDER BY provider, total_successes DESC;
  `,

  // Top performing patterns per provider
  TOP_PATTERNS: `
    SELECT 
      provider,
      pattern_type,
      pattern_value,
      successful_uses,
      ROUND(average_rating::numeric, 2) as avg_rating,
      last_success_at
    FROM prompt_learnings
    WHERE avoid_pattern = false 
      AND successful_uses >= 2
    ORDER BY 
      provider,
      (average_rating * LOG(successful_uses + 1)) DESC
    LIMIT 30;
  `,

  // Avoid patterns that have been flagged
  AVOID_PATTERNS: `
    SELECT 
      provider,
      pattern_type,
      pattern_value,
      failed_uses,
      total_uses,
      ROUND((failed_uses::numeric / total_uses) * 100, 1) as failure_rate_pct,
      avoid_pattern
    FROM prompt_learnings
    WHERE failed_uses >= 1
    ORDER BY 
      avoid_pattern DESC,
      failure_rate_pct DESC;
  `,

  // Patterns close to becoming "avoid" (>40% failure, <60%)
  PATTERNS_AT_RISK: `
    SELECT 
      provider,
      pattern_type,
      pattern_value,
      failed_uses,
      total_uses,
      ROUND((failed_uses::numeric / total_uses) * 100, 1) as failure_rate_pct
    FROM prompt_learnings
    WHERE total_uses >= 2
      AND (failed_uses::numeric / total_uses) BETWEEN 0.4 AND 0.6
      AND avoid_pattern = false
    ORDER BY failure_rate_pct DESC;
  `,

  // Semantic traits (high-level learned concepts)
  SEMANTIC_TRAITS: `
    SELECT 
      provider,
      pattern_value as semantic_trait,
      successful_uses,
      ROUND(average_rating::numeric, 2) as avg_rating,
      last_success_at
    FROM prompt_learnings
    WHERE pattern_type = 'semantic_trait'
    ORDER BY provider, successful_uses DESC;
  `,

  // Time decay check: patterns that might be stale
  STALE_PATTERNS: `
    SELECT 
      provider,
      pattern_type,
      pattern_value,
      successful_uses,
      last_success_at,
      EXTRACT(DAY FROM NOW() - last_success_at) as days_since_success
    FROM prompt_learnings
    WHERE last_success_at IS NOT NULL
      AND last_success_at < NOW() - INTERVAL '30 days'
    ORDER BY days_since_success DESC
    LIMIT 20;
  `,

  // Provider comparison: which provider has best learning
  PROVIDER_HEALTH: `
    SELECT 
      provider,
      COUNT(*) as total_patterns,
      SUM(CASE WHEN avoid_pattern THEN 1 ELSE 0 END) as avoided_count,
      ROUND(AVG(average_rating)::numeric, 2) as overall_avg_rating,
      MAX(last_success_at) as most_recent_success,
      MAX(last_failure_at) as most_recent_failure
    FROM prompt_learnings
    GROUP BY provider
    ORDER BY overall_avg_rating DESC;
  `,
};

// ============================================================
// EFFECTIVE SCORE CALCULATION (matches edge function logic)
// ============================================================

export function calculateTimeDecay(lastSuccessAt: string | null): number {
  if (!lastSuccessAt) return 0.5;
  
  const daysSince = (Date.now() - new Date(lastSuccessAt).getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSince <= 7) return 1.0;
  if (daysSince <= 14) return 0.9;
  if (daysSince <= 30) return 0.75;
  if (daysSince <= 60) return 0.5;
  return 0.25;
}

export function calculateEffectiveScore(
  avgRating: number,
  successfulUses: number,
  lastSuccessAt: string | null
): number {
  const usageBoost = Math.log(successfulUses + 1);
  const timeDecay = calculateTimeDecay(lastSuccessAt);
  return avgRating * usageBoost * timeDecay;
}

// ============================================================
// THRESHOLDS (for reference)
// ============================================================

export const LEARNING_THRESHOLDS = {
  // Positive learning triggers
  POSITIVE_RATING_MIN: 4,      // Rating >= 4 is "success"
  
  // Negative learning triggers  
  NEGATIVE_RATING_MAX: 2,      // Rating <= 2 is "failure"
  
  // Avoid pattern threshold
  AVOID_FAILURE_RATE: 0.6,     // 60% failure rate = avoid
  AVOID_MIN_USES: 3,           // Need at least 3 uses to mark avoid
  
  // Pattern selection for enrichment
  MIN_SUCCESSFUL_USES: 2,      // Need 2+ successes to influence
  MIN_AVG_RATING: 4,           // Need 4+ avg rating to influence
  MAX_POSITIVE_PATTERNS: 15,   // Cap on positive patterns injected
  MAX_AVOID_PATTERNS: 5,       // Cap on avoid patterns injected
  MAX_HINT_LENGTH: 400,        // Max chars for learned hints (~25% of system prompt)
  
  // Pattern type limits
  MAX_PER_TYPE: 3,             // Max patterns per type (camera, lighting, etc.)
};
