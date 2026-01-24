/**
 * Analyze prompts and extract learnable patterns
 * Supports BOTH positive learning (rating >= 4) and negative learning (rating <= 2)
 * Also extracts semantic traits via LLM classification
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeRequest {
  job_id?: string;
  jobId?: string; // Support both naming conventions
  provider: "sora" | "runway" | "luma";
  enriched_prompt?: string;
  enrichedPrompt?: string;
  original_prompt?: string;
  originalPrompt?: string;
  style_hints?: string;
  styleHints?: string;
  // Legacy single rating (deprecated, kept for backwards compat)
  rating?: number;
  // Dual-axis ratings (preferred)
  match_rating?: number;
  matchRating?: number;
  preference_rating?: number;
  preferenceRating?: number;
  source?: "human" | "auto"; // Track learning source
}

// Keywords/phrases to detect each pattern type
const PATTERN_DETECTORS: Record<string, RegExp[]> = {
  subject: [
    /\b(person|man|woman|child|figure|silhouette|character)\b/gi,
    /\b(car|vehicle|motorcycle|bike|truck)\b/gi,
    /\b(animal|dog|cat|bird|horse)\b/gi,
    /\b(object|product|item)\b/gi,
  ],
  camera: [
    /\b(close-up|closeup|macro|extreme close)\b/gi,
    /\b(wide shot|wide angle|panoramic|establishing)\b/gi,
    /\b(tracking shot|dolly|crane|aerial|drone)\b/gi,
    /\b(handheld|POV|first person|over the shoulder)\b/gi,
    /\b(pan|tilt|zoom|push in|pull out)\b/gi,
    /\b(static|locked off|tripod)\b/gi,
    /\b(low angle|high angle|dutch angle|bird's eye)\b/gi,
  ],
  lighting: [
    /\b(golden hour|magic hour|sunset|sunrise)\b/gi,
    /\b(natural light|daylight|overcast|diffused)\b/gi,
    /\b(dramatic|high contrast|low-key|chiaroscuro)\b/gi,
    /\b(neon|ambient|practical lights|street lights)\b/gi,
    /\b(backlit|rim light|silhouette|halo)\b/gi,
    /\b(soft light|hard light|dappled)\b/gi,
  ],
  motion: [
    /\b(slow motion|slow-mo|slowmo)\b/gi,
    /\b(fast|rapid|quick|sudden|burst)\b/gi,
    /\b(smooth|fluid|flowing|gliding)\b/gi,
    /\b(dynamic|energetic|explosive)\b/gi,
    /\b(gentle|subtle|soft movement)\b/gi,
    /\b(accelerat|decelerat|speed)\b/gi,
  ],
  environment: [
    /\b(urban|city|street|metropolitan)\b/gi,
    /\b(nature|forest|mountain|ocean|beach)\b/gi,
    /\b(indoor|interior|room|studio)\b/gi,
    /\b(desert|arid|sand|dunes)\b/gi,
    /\b(rain|snow|fog|mist|weather)\b/gi,
    /\b(night|evening|dusk|dawn)\b/gi,
  ],
  mood: [
    /\b(cinematic|epic|dramatic|intense)\b/gi,
    /\b(peaceful|serene|calm|tranquil)\b/gi,
    /\b(dark|moody|mysterious|ominous)\b/gi,
    /\b(bright|vibrant|energetic|lively)\b/gi,
    /\b(nostalgic|vintage|retro)\b/gi,
    /\b(ethereal|dreamy|magical|fantasy)\b/gi,
  ],
};

function extractPatterns(prompt: string): Map<string, Set<string>> {
  const patterns = new Map<string, Set<string>>();
  
  for (const [patternType, regexes] of Object.entries(PATTERN_DETECTORS)) {
    const matches = new Set<string>();
    
    for (const regex of regexes) {
      const found = prompt.match(regex);
      if (found) {
        found.forEach(match => matches.add(match.toLowerCase()));
      }
    }
    
    if (matches.size > 0) {
      patterns.set(patternType, matches);
    }
  }
  
  return patterns;
}

// LLM-based semantic trait extraction
async function extractSemanticTraits(
  prompt: string, 
  openaiKey: string
): Promise<string[]> {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a video prompt analyst. Extract 2-4 high-level semantic traits from the prompt.
            
Return ONLY a JSON array of trait strings. Examples:
- "physics-driven motion"
- "single-subject cinematic framing"
- "environmental interaction emphasis"
- "high-energy camera language"
- "intimate character focus"
- "atmospheric world-building"
- "abstract visual metaphor"

Keep traits concise (2-4 words). Return only the JSON array, nothing else.`
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 100,
      }),
    });

    if (!response.ok) return [];
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return [];
    
    try {
      const traits = JSON.parse(content);
      return Array.isArray(traits) ? traits.slice(0, 4) : [];
    } catch {
      return [];
    }
  } catch (error) {
    console.error("Semantic extraction failed:", error);
    return [];
  }
}

// Update or insert a pattern learning
async function upsertPatternLearning(
  supabaseUrl: string,
  supabaseKey: string,
  provider: string,
  patternType: string,
  patternValue: string,
  rating: number,
  isSuccess: boolean,
  prompt: string,
  source: "human" | "auto" = "human"
): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data: existing } = await supabase
    .from("prompt_learnings")
    .select("id, total_uses, successful_uses, failed_uses, average_rating, example_prompts, avoid_pattern, learning_source")
    .eq("provider", provider)
    .eq("pattern_type", patternType)
    .eq("pattern_value", patternValue)
    .single();

  const now = new Date().toISOString();

  if (existing) {
    const ex = existing as Record<string, unknown>;
    const totalUses = (ex.total_uses as number) || 0;
    const successfulUses = (ex.successful_uses as number) || 0;
    const failedUses = (ex.failed_uses as number) || 0;
    const avgRating = (ex.average_rating as number) || 0;
    const examplePrompts = (ex.example_prompts as string[]) || [];
    
    const newTotalUses = totalUses + 1;
    const newSuccessfulUses = successfulUses + (isSuccess ? 1 : 0);
    const newFailedUses = failedUses + (isSuccess ? 0 : 1);
    const newAverage = ((avgRating * totalUses) + rating) / newTotalUses;
    
    // Calculate if pattern should be avoided (>60% failure rate)
    const failureRate = newFailedUses / newTotalUses;
    const shouldAvoid = newTotalUses >= 3 && failureRate > 0.6;
    
    // Keep last 5 example prompts
    const examples = [...examplePrompts];
    if (isSuccess) {
      if (examples.length >= 5) examples.shift();
      examples.push(prompt.substring(0, 200));
    }

    await supabase
      .from("prompt_learnings")
      .update({
        total_uses: newTotalUses,
        successful_uses: newSuccessfulUses,
        failed_uses: newFailedUses,
        average_rating: Math.round(newAverage * 100) / 100,
        example_prompts: examples,
        avoid_pattern: shouldAvoid,
        ...(isSuccess ? { last_success_at: now } : { last_failure_at: now }),
      })
      .eq("id", ex.id as string);
  } else {
    await supabase
      .from("prompt_learnings")
      .insert({
        provider,
        pattern_type: patternType,
        pattern_value: patternValue,
        total_uses: 1,
        successful_uses: isSuccess ? 1 : 0,
        failed_uses: isSuccess ? 0 : 1,
        average_rating: rating,
        example_prompts: isSuccess ? [prompt.substring(0, 200)] : [],
        avoid_pattern: false,
        learning_source: source,
        ...(isSuccess ? { last_success_at: now } : { last_failure_at: now }),
      });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json() as AnalyzeRequest;
    
    // Normalize field names (support both snake_case and camelCase)
    const job_id = body.job_id || body.jobId;
    const provider = body.provider;
    const enriched_prompt = body.enriched_prompt || body.enrichedPrompt || "";
    const original_prompt = body.original_prompt || body.originalPrompt;
    const style_hints = body.style_hints || body.styleHints;
    const source = body.source || "human";

    // Support dual-axis ratings (preferred) or legacy single rating
    const matchRating = body.match_rating || body.matchRating;
    const preferenceRating = body.preference_rating || body.preferenceRating;
    const legacyRating = body.rating;

    // Determine which rating mode we're using
    const isDualAxis = matchRating !== undefined && preferenceRating !== undefined;
    
    console.log(`Analyzing prompt (source: ${source}, dual-axis: ${isDualAxis}, provider: ${provider})`);

    if (!enriched_prompt) {
      return new Response(
        JSON.stringify({ learned: false, reason: "No enriched prompt provided" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DUAL-AXIS LEARNING MATRIX
    // 1. Match ≥4 AND Preference ≥4 → Positive learning
    // 2. Match ≤2 AND Preference ≤2 → Negative learning  
    // 3. Match ≤2 AND Preference ≥4 → SERENDIPITY - DO NOT learn (happy accident)
    // 4. Match ≥4 AND Preference ≤2 → Accurate but disliked (no learning for now)
    // Neutral (3) on either axis → no learning

    let isSuccess = false;
    let isFailure = false;
    let isSerendipity = false;
    let learningRating = 3; // Default neutral

    if (isDualAxis) {
      const matchHigh = matchRating >= 4;
      const matchLow = matchRating <= 2;
      const prefHigh = preferenceRating >= 4;
      const prefLow = preferenceRating <= 2;

      if (matchHigh && prefHigh) {
        isSuccess = true;
        learningRating = 5;
        console.log(`Dual-axis: Match ${matchRating}, Pref ${preferenceRating} → POSITIVE learning`);
      } else if (matchLow && prefLow) {
        isFailure = true;
        learningRating = 1;
        console.log(`Dual-axis: Match ${matchRating}, Pref ${preferenceRating} → NEGATIVE learning`);
      } else if (matchLow && prefHigh) {
        isSerendipity = true;
        console.log(`Dual-axis: Match ${matchRating}, Pref ${preferenceRating} → SERENDIPITY (no learning)`);
      } else if (matchHigh && prefLow) {
        console.log(`Dual-axis: Match ${matchRating}, Pref ${preferenceRating} → Accurate but disliked (no learning)`);
      } else {
        console.log(`Dual-axis: Match ${matchRating}, Pref ${preferenceRating} → Neutral (no learning)`);
      }
    } else if (legacyRating !== undefined) {
      // Legacy single-rating fallback
      isSuccess = legacyRating >= 4;
      isFailure = legacyRating <= 2;
      learningRating = legacyRating;
      console.log(`Legacy rating: ${legacyRating} → ${isSuccess ? "positive" : isFailure ? "negative" : "neutral"}`);
    }

    // Update serendipity flag on the job (set false if not serendipity to allow re-rating)
    if (job_id) {
      await supabase
        .from("video_jobs")
        .update({ is_serendipity: isSerendipity })
        .eq("id", job_id);
    }

    // Serendipity: don't learn patterns, just return
    if (isSerendipity) {
      return new Response(
        JSON.stringify({ 
          learned: false, 
          reason: "Serendipity detected - happy accident flagged, no pattern learning",
          is_serendipity: true,
          match_rating: matchRating,
          preference_rating: preferenceRating,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Only learn from clear signals
    if (!isSuccess && !isFailure) {
      return new Response(
        JSON.stringify({ learned: false, reason: "No clear learning signal (neutral or conflicting ratings)" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Learning ${isSuccess ? "positive" : "negative"} patterns for ${provider}`);

    // Extract lexical patterns
    const patterns = extractPatterns(enriched_prompt);
    const learnedPatterns: string[] = [];

    // Process each pattern type
    for (const [patternType, values] of patterns) {
      for (const patternValue of values) {
        await upsertPatternLearning(
          supabaseUrl,
          supabaseServiceKey,
          provider,
          patternType,
          patternValue,
          learningRating,
          isSuccess,
          enriched_prompt,
          source
        );
        learnedPatterns.push(`${patternType}:${patternValue}`);
      }
    }

    // Learn from style hints
    if (style_hints) {
      const hints = style_hints.split(/[,;]/).map(h => h.trim().toLowerCase()).filter(Boolean);
      for (const hint of hints) {
        await upsertPatternLearning(
          supabaseUrl,
          supabaseServiceKey,
          provider,
          "style_hint",
          hint,
          learningRating,
          isSuccess,
          enriched_prompt,
          source
        );
        learnedPatterns.push(`style_hint:${hint}`);
      }
    }

    // Extract semantic traits (only for successes, uses LLM)
    let semanticTraits: string[] = [];
    if (isSuccess && openaiKey) {
      semanticTraits = await extractSemanticTraits(enriched_prompt, openaiKey);
      
      for (const trait of semanticTraits) {
        await upsertPatternLearning(
          supabaseUrl,
          supabaseServiceKey,
          provider,
          "semantic_trait",
          trait.toLowerCase(),
          learningRating,
          true,
          enriched_prompt,
          source
        );
        learnedPatterns.push(`semantic_trait:${trait}`);
      }
    }

    console.log(`Learned ${learnedPatterns.length} patterns for ${provider} (${isSuccess ? "positive" : "negative"})`);

    return new Response(
      JSON.stringify({
        learned: true,
        learning_type: isSuccess ? "positive" : "negative",
        provider,
        patterns_count: learnedPatterns.length,
        patterns: learnedPatterns,
        semantic_traits: semanticTraits,
        match_rating: matchRating,
        preference_rating: preferenceRating,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error analyzing prompt:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
