/**
 * Shared cluster key utilities - MUST be identical across all functions
 * Used by: queue-comparisons, get-provider-recommendation, queue-video-smart
 */

/**
 * Derives a canonical cluster key from routing tags
 * @param tags - Array of routing tags (can be null/undefined)
 * @returns Normalized cluster key string
 */
export function deriveClusterKey(tags: string[] | null | undefined): string {
  if (!tags || tags.length === 0) return "general";
  
  // Normalize: lowercase, trim, dedupe, sort, take top 3
  const normalized = [...new Set(
    tags
      .map(t => t.toLowerCase().trim())
      .filter(t => t.length > 0)
  )]
    .sort()
    .slice(0, 3);
  
  return normalized.length > 0 ? normalized.join("|") : "general";
}
