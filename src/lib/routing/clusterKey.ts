/**
 * Shared cluster key derivation logic for routing analytics.
 * This MUST match the backend logic in supabase/functions/_shared/cluster-utils.ts
 */

export function normalizeRoutingTag(tag: string): string {
  return tag
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function deriveClusterKey(tags: string[] | null | undefined): string {
  if (!tags?.length) return "general";

  const normalized = [...new Set(tags.map(normalizeRoutingTag).filter(t => t.length > 0))]
    .sort()
    .slice(0, 3);

  return normalized.length > 0 ? normalized.join("|") : "general";
}
