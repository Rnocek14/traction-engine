/**
 * Story Engine Types (Frontend Mirror)
 * 
 * Mirrors the edge function types for use in React components.
 * These must stay in sync with:
 *   - supabase/functions/_shared/story-types.ts
 *   - supabase/functions/_shared/vertical-profiles.ts
 *   - supabase/functions/_shared/story-type-router.ts
 */

// ─── Story Types ────────────────────────────────────────────

export type StoryType =
  | "viral_hook"
  | "pas"
  | "authority"
  | "listicle"
  | "micro_story"
  | "before_after"
  | "trend_hijack"
  | "myth";

export type ContentGoal = "reach" | "sell" | "authority" | "brand" | "retain";
export type EmotionalIntensity = "low" | "medium" | "high" | "extreme";
export type Pacing = "fast" | "moderate" | "slow";

// ─── Hook Categories ────────────────────────────────────────

export type HookCategory =
  | "curiosity"
  | "novelty"
  | "shock"
  | "fear"
  | "authority"
  | "promise"
  | "social_proof";

// ─── Verticals ──────────────────────────────────────────────

export type ContentVertical =
  | "health"
  | "finance"
  | "saas"
  | "education"
  | "entertainment"
  | "ecommerce"
  | "lifestyle"
  | "news"
  | "gadgets"
  | "home"
  | "toys";

// ─── Display Metadata ───────────────────────────────────────

export const STORY_TYPE_META: Record<StoryType, { label: string; icon: string; description: string }> = {
  viral_hook:   { label: "Viral Hook",    icon: "🔥", description: "Scroll-stopping, hook-first, fast payoff" },
  pas:          { label: "PAS",           icon: "💰", description: "Problem → Agitate → Solution" },
  authority:    { label: "Authority",     icon: "🧠", description: "Credibility-building, contrarian take" },
  listicle:     { label: "Listicle",      icon: "📋", description: "Retention farming, numbered items" },
  micro_story:  { label: "Micro-Story",   icon: "📖", description: "Emotional mini-narrative" },
  before_after: { label: "Before/After",  icon: "🔄", description: "Transformation reveal" },
  trend_hijack: { label: "Trend Hijack",  icon: "📈", description: "Cultural moment capture" },
  myth:         { label: "Myth/Cinematic",icon: "🎭", description: "Symbolic brand building" },
};

export const VERTICAL_META: Record<ContentVertical, { label: string; icon: string }> = {
  health:        { label: "Health & Wellness",  icon: "💊" },
  finance:       { label: "Finance",            icon: "💵" },
  saas:          { label: "SaaS & Software",    icon: "💻" },
  education:     { label: "Education",          icon: "📚" },
  entertainment: { label: "Entertainment",      icon: "🎮" },
  ecommerce:     { label: "E-Commerce",         icon: "🛒" },
  lifestyle:     { label: "Lifestyle",          icon: "✨" },
  news:          { label: "News",               icon: "📰" },
  gadgets:       { label: "Gadgets",            icon: "🔧" },
  home:          { label: "Home",               icon: "🏠" },
  toys:          { label: "Toys",               icon: "🧸" },
};

export const GOAL_META: Record<ContentGoal, { label: string; icon: string }> = {
  reach:     { label: "Reach",     icon: "📣" },
  sell:      { label: "Sell",      icon: "💳" },
  authority: { label: "Authority", icon: "🏛️" },
  brand:     { label: "Brand",     icon: "⭐" },
  retain:    { label: "Retain",    icon: "🔁" },
};

// ─── Research Types (Frontend Mirror) ───────────────────────

export type ResearchMode = "auto" | "on" | "off";
export type RetrievalMethod = "web" | "provided_sources" | "none";
export type EvidenceLevel = "strong" | "moderate" | "mixed" | "insufficient";

export interface ResearchClaim {
  claim_id: string;
  statement: string;
  evidence_level: EvidenceLevel;
  source_url?: string;
  source_title?: string;
  supporting_excerpt?: string;
  do_not_say?: string[];
}

export interface ResearchSource {
  title: string;
  url: string;
  publisher?: string;
  excerpt?: string;
  retrieved_at: string;
}

export interface ResearchBrief {
  mode: ResearchMode;
  activated: boolean;
  grounded: boolean;
  retrieval: RetrievalMethod;
  failure_reason?: string;
  concept_intent: string;
  queries: string[];
  sources: ResearchSource[];
  claims: ResearchClaim[];
  angles: string[];
  do_not_say_global: string[];
}

// ─── Helpers ────────────────────────────────────────────────

export function isViralStoryType(type: StoryType): boolean {
  return type !== "myth";
}

export function getStoryTypeLabel(type: StoryType): string {
  return STORY_TYPE_META[type]?.label || type;
}

export function getVerticalLabel(vertical: ContentVertical): string {
  return VERTICAL_META[vertical]?.label || vertical;
}
