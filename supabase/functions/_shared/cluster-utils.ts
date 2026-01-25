/**
 * Shared cluster key utilities - MUST be identical across all functions
 * Used by: queue-comparisons, get-provider-recommendation, queue-video-smart, auto-rate-video
 * 
 * This module provides the SINGLE SOURCE OF TRUTH for tag normalization and clustering.
 * All functions MUST use these utilities to prevent drift.
 */

/**
 * Normalizes a tag: strips junk, collapses underscores, trims edges.
 * This is the canonical normalization used everywhere.
 * NOTE: Does NOT apply synonym mapping (that's done in auto-rate-video before storage)
 */
export function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")        // spaces/hyphens → underscore
    .replace(/[^a-z0-9_]/g, "")     // strip punctuation/junk
    .replace(/_+/g, "_")            // collapse multiple underscores
    .replace(/^_+|_+$/g, "");       // trim leading/trailing underscores
}

/**
 * Derives a canonical cluster key from routing tags
 * @param tags - Array of routing tags (can be raw or pre-sanitized)
 * @returns Normalized cluster key string
 * 
 * This function is DEFENSIVE: it re-normalizes tags even if they should
 * already be clean. This prevents drift if a future caller passes raw tags.
 * 
 * Expected output: "cinematic|human_focus|x_dragon"
 */
export function deriveClusterKey(tags: string[] | null | undefined): string {
  if (!tags?.length) return "general";
  
  // Defensive: re-normalize even though tags should already be clean
  const normalized = [...new Set(
    tags
      .map(normalizeTag)
      .filter(t => t.length > 0)
  )]
    .sort()
    .slice(0, 3);
  
  return normalized.length > 0 ? normalized.join("|") : "general";
}
