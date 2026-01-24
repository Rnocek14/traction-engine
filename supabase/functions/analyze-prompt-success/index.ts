/**
 * Analyze successful prompts and extract learnable patterns
 * This powers the self-improving prompt optimization system
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AnalyzeRequest {
  job_id: string;
  provider: "sora" | "runway" | "luma";
  enriched_prompt: string;
  original_prompt?: string;
  style_hints?: string;
  rating: number;
}

// Pattern categories we want to learn from successful prompts
const PATTERN_TYPES = [
  "subject",      // What is the main focus (person, car, animal, etc.)
  "camera",       // Shot type and camera movement
  "lighting",     // Lighting setup and quality
  "motion",       // How things move
  "environment",  // Setting and location
  "mood",         // Emotional tone
  "style_hint",   // User-provided style hints that worked
] as const;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      job_id, 
      provider, 
      enriched_prompt, 
      original_prompt, 
      style_hints, 
      rating 
    } = await req.json() as AnalyzeRequest;

    // Only learn from successful prompts (rating >= 4)
    if (rating < 4) {
      return new Response(
        JSON.stringify({ learned: false, reason: "Rating too low for learning" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Analyzing successful prompt for ${provider} (rating: ${rating})`);

    // Extract patterns from the enriched prompt
    const patterns = extractPatterns(enriched_prompt);
    const learnedPatterns: string[] = [];

    // Process each pattern type
    for (const [patternType, values] of patterns) {
      for (const patternValue of values) {
        // Upsert the pattern learning
        const { data: existing } = await supabase
          .from("prompt_learnings")
          .select("id, total_uses, successful_uses, average_rating, example_prompts")
          .eq("provider", provider)
          .eq("pattern_type", patternType)
          .eq("pattern_value", patternValue)
          .single();

        if (existing) {
          // Update existing pattern
          const newTotalUses = existing.total_uses + 1;
          const newSuccessfulUses = existing.successful_uses + 1;
          const currentAvg = existing.average_rating || 0;
          const newAverage = ((currentAvg * existing.total_uses) + rating) / newTotalUses;
          
          // Keep last 5 example prompts
          const examples = existing.example_prompts || [];
          if (examples.length >= 5) examples.shift();
          examples.push(enriched_prompt.substring(0, 200));

          await supabase
            .from("prompt_learnings")
            .update({
              total_uses: newTotalUses,
              successful_uses: newSuccessfulUses,
              average_rating: Math.round(newAverage * 100) / 100,
              example_prompts: examples,
            })
            .eq("id", existing.id);
        } else {
          // Insert new pattern
          await supabase
            .from("prompt_learnings")
            .insert({
              provider,
              pattern_type: patternType,
              pattern_value: patternValue,
              total_uses: 1,
              successful_uses: 1,
              average_rating: rating,
              example_prompts: [enriched_prompt.substring(0, 200)],
            });
        }

        learnedPatterns.push(`${patternType}:${patternValue}`);
      }
    }

    // Also learn from style hints if provided
    if (style_hints) {
      const hints = style_hints.split(/[,;]/).map(h => h.trim().toLowerCase()).filter(Boolean);
      
      for (const hint of hints) {
        const { data: existing } = await supabase
          .from("prompt_learnings")
          .select("id, total_uses, successful_uses, average_rating")
          .eq("provider", provider)
          .eq("pattern_type", "style_hint")
          .eq("pattern_value", hint)
          .single();

        if (existing) {
          const newTotalUses = existing.total_uses + 1;
          const newSuccessfulUses = existing.successful_uses + 1;
          const currentAvg = existing.average_rating || 0;
          const newAverage = ((currentAvg * existing.total_uses) + rating) / newTotalUses;

          await supabase
            .from("prompt_learnings")
            .update({
              total_uses: newTotalUses,
              successful_uses: newSuccessfulUses,
              average_rating: Math.round(newAverage * 100) / 100,
            })
            .eq("id", existing.id);
        } else {
          await supabase
            .from("prompt_learnings")
            .insert({
              provider,
              pattern_type: "style_hint",
              pattern_value: hint,
              total_uses: 1,
              successful_uses: 1,
              average_rating: rating,
            });
        }

        learnedPatterns.push(`style_hint:${hint}`);
      }
    }

    console.log(`Learned ${learnedPatterns.length} patterns for ${provider}`);

    return new Response(
      JSON.stringify({
        learned: true,
        provider,
        patterns_count: learnedPatterns.length,
        patterns: learnedPatterns,
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
