/**
 * Shared cluster key utilities - MUST be identical across all functions
 * Used by: queue-comparisons, get-provider-recommendation, queue-video-smart
 * 
 * IMPORTANT: This utility expects ALREADY SANITIZED tags from auto_routing_tags.
 * The sanitization (normalization, allowlist filtering) happens in auto-rate-video.
 * This function only handles clustering logic (sort, dedupe, top-3, join).
 */

/**
 * Derives a canonical cluster key from routing tags
 * @param tags - Array of already-sanitized routing tags (from auto_routing_tags column)
 * @returns Normalized cluster key string
 * 
 * Expected input: ["cinematic", "human_focus", "x_dragon"] (already normalized)
 * Output: "cinematic|human_focus|x_dragon"
 */
export function deriveClusterKey(tags: string[] | null | undefined): string {
  if (!tags || tags.length === 0) return "general";
  
  // Tags should already be sanitized by auto-rate-video
  // We just need to: dedupe, sort, take top 3, join
  const normalized = [...new Set(
    tags
      .map(t => t.toLowerCase().trim())
      .filter(t => t.length > 0)
  )]
    .sort()
    .slice(0, 3);
  
  return normalized.length > 0 ? normalized.join("|") : "general";
}
