/**
 * trend-enrichment.ts
 * 
 * Pulls recent, high-scoring scraped insights and formats them
 * as lightweight enrichment context for generation prompts.
 * 
 * Rules:
 * - Max 5 insights per run
 * - Max 2 hook patterns, 2 emotional triggers, 1 format recommendation
 * - Only recent (last 7 days) + high viral_score (≥60)
 * - Returns structured context block, not raw dumps
 */

interface ScrapedInsight {
  id: string;
  title: string | null;
  topics: string[];
  hook_patterns: string[];
  emotional_triggers: string[];
  content_format: string | null;
  visual_style: string | null;
  viral_score: number | null;
  created_at: string;
}

export interface TrendEnrichment {
  enabled: boolean;
  mode: "none" | "light" | "trend_driven";
  hook_patterns: string[];
  emotional_triggers: string[];
  format_suggestion: string | null;
  topic_signals: string[];
  insight_ids: string[];
  prompt_block: string;
}

const EMPTY_ENRICHMENT: TrendEnrichment = {
  enabled: false,
  mode: "none",
  hook_patterns: [],
  emotional_triggers: [],
  format_suggestion: null,
  topic_signals: [],
  insight_ids: [],
  prompt_block: "",
};

/**
 * Fetch and filter recent scraped insights matching a vertical/topic.
 * Returns a bounded enrichment object ready to inject into prompts.
 */
export async function fetchTrendEnrichment(
  supabase: { from: (table: string) => unknown },
  opts: {
    vertical?: string;
    pillar?: string;
    topic_prompt?: string;
    mode?: "none" | "light" | "trend_driven";
  }
): Promise<TrendEnrichment> {
  const mode = opts.mode || "light";
  if (mode === "none") return EMPTY_ENRICHMENT;

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // deno-lint-ignore no-explicit-any
    const sb = supabase as any;
    const { data, error } = await sb
      .from("scraped_insights")
      .select("id, title, topics, hook_patterns, emotional_triggers, content_format, viral_score, created_at")
      .gte("created_at", sevenDaysAgo)
      .gte("viral_score", 60)
      .order("viral_score", { ascending: false })
      .limit(10);

    if (error || !data || data.length === 0) {
      console.log("[trend-enrichment] No matching insights found");
      return EMPTY_ENRICHMENT;
    }

    const insights = data as ScrapedInsight[];

    // P0 FIX: HARD VERTICAL GATE
    // If vertical is provided, ONLY use insights that match via relevance_tags.
    // If no matches found, return empty — do NOT fall through to loose keyword matching.
    let relevant = insights;
    if (opts.vertical) {
      const verticalLower = opts.vertical.toLowerCase();
      // deno-lint-ignore no-explicit-any
      const tagFiltered = insights.filter((i: any) => {
        const tags: string[] = i.relevance_tags || [];
        return tags.some((t: string) => t.toLowerCase() === verticalLower);
      });
      if (tagFiltered.length < 2) {
        // HARD GATE: No relevant insights for this vertical — return empty
        console.log(`[trend-enrichment] Hard gate: only ${tagFiltered.length} insights match vertical "${opts.vertical}" — skipping enrichment`);
        return EMPTY_ENRICHMENT;
      }
      relevant = tagFiltered as ScrapedInsight[];
    }

    // Secondary: keyword relevance scoring
    if (opts.topic_prompt || opts.pillar) {
      const keywords = [
        ...(opts.topic_prompt?.toLowerCase().split(/\s+/) || []),
        ...(opts.pillar?.toLowerCase().split(/\s+/) || []),
      ].filter(w => w.length > 3);

      if (keywords.length > 0) {
        const scored = relevant.map(insight => {
          const text = [
            insight.title || "",
            ...insight.topics,
          ].join(" ").toLowerCase();
          const matches = keywords.filter(kw => text.includes(kw)).length;
          return { insight, relevance: matches };
        });
        scored.sort((a, b) => b.relevance - a.relevance);
        relevant = scored.slice(0, 5).map(s => s.insight);
      }
    }

    // Cap at 5 insights
    relevant = relevant.slice(0, 5);

    // Extract bounded enrichment
    const allHooks = relevant.flatMap(i => i.hook_patterns || []);
    const allEmotions = relevant.flatMap(i => i.emotional_triggers || []);
    const allTopics = relevant.flatMap(i => i.topics || []);
    const formats = relevant.map(i => i.content_format).filter(Boolean) as string[];

    // Deduplicate and cap
    const hookPatterns = [...new Set(allHooks)].slice(0, 2);
    const emotionalTriggers = [...new Set(allEmotions)].slice(0, 2);
    const topicSignals = [...new Set(allTopics)].slice(0, 3);
    const formatSuggestion = formats[0] || null;
    const insightIds = relevant.map(i => i.id);

    // Build prompt block
    const lines: string[] = [];
    lines.push("TREND INTELLIGENCE (use as inspiration, not replacement):");
    if (hookPatterns.length > 0) {
      lines.push(`- Trending hook styles: ${hookPatterns.join(" | ")}`);
    }
    if (emotionalTriggers.length > 0) {
      lines.push(`- Rising emotional angles: ${emotionalTriggers.join(", ")}`);
    }
    if (formatSuggestion) {
      lines.push(`- Hot format: ${formatSuggestion}`);
    }
    if (topicSignals.length > 0) {
      lines.push(`- Related trending topics: ${topicSignals.join(", ")}`);
    }

    const promptBlock = lines.length > 1 ? lines.join("\n") : "";

    console.log(`[trend-enrichment] ${mode}: ${relevant.length} insights, ${hookPatterns.length} hooks, ${emotionalTriggers.length} emotions, format=${formatSuggestion}`);

    return {
      enabled: true,
      mode,
      hook_patterns: hookPatterns,
      emotional_triggers: emotionalTriggers,
      format_suggestion: formatSuggestion,
      topic_signals: topicSignals,
      insight_ids: insightIds,
      prompt_block: promptBlock,
    };
  } catch (err) {
    console.error("[trend-enrichment] Error (non-blocking):", err);
    return EMPTY_ENRICHMENT;
  }
}
