/**
 * Enrich Video Prompts v2.0
 * 
 * Provider-specific prompt compilation:
 * - Runway: Ultra-concise, camera-first, motion verbs required
 * - Luma: Physics-focused, environment interactions, moderate length
 * - Sora: Director's Brief style, detailed cinematography
 * 
 * Features:
 * - Provider-specific GPT instructions
 * - Hard length caps with intelligent compression
 * - Time-decayed pattern learning
 * - Non-truncation guarantee
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  getProviderSystemPrompt, 
  compileForProvider,
  PROVIDER_LIMITS,
  type VideoProvider,
  type CompiledPrompt 
} from "../_shared/prompt-compiler.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EnrichRequest {
  prompt: string;
  provider?: VideoProvider;
  style_hints?: string;
}

interface EnrichResponse {
  original: string;
  enriched: string;           // The final provider-optimized prompt
  full_enrichment?: string;   // Full GPT output before compression (for debugging)
  provider: VideoProvider | null;
  schema_version: string;
  char_count: number;
  max_chars: number;
  was_compressed: boolean;
}

interface PatternLearning {
  pattern_type: string;
  pattern_value: string;
  average_rating: number;
  successful_uses: number;
  last_success_at: string | null;
}

interface AvoidPattern {
  pattern_type: string;
  pattern_value: string;
  failed_uses: number;
}

// Time decay function: patterns from 30+ days ago get 50% weight
function calculateTimeDecay(lastSuccessAt: string | null): number {
  if (!lastSuccessAt) return 0.5;
  
  const daysSince = (Date.now() - new Date(lastSuccessAt).getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSince <= 7) return 1.0;
  if (daysSince <= 14) return 0.9;
  if (daysSince <= 30) return 0.75;
  if (daysSince <= 60) return 0.5;
  return 0.25;
}

function calculateEffectiveScore(pattern: PatternLearning): number {
  const baseScore = pattern.average_rating;
  const usageBoost = Math.log(pattern.successful_uses + 1);
  const timeDecay = calculateTimeDecay(pattern.last_success_at);
  return baseScore * usageBoost * timeDecay;
}

async function getLearnedPatterns(
  supabaseUrl: string,
  supabaseKey: string,
  provider: string
): Promise<PatternLearning[]> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data, error } = await supabase
    .from("prompt_learnings")
    .select("pattern_type, pattern_value, average_rating, successful_uses, last_success_at")
    .eq("provider", provider)
    .eq("avoid_pattern", false)
    .gte("successful_uses", 2)
    .gte("average_rating", 4)
    .limit(30);

  if (error) {
    console.error("Failed to fetch learned patterns:", error);
    return [];
  }

  if (!data || data.length === 0) return [];

  const scored = data.map(p => ({
    ...p,
    effectiveScore: calculateEffectiveScore(p as PatternLearning)
  }));
  
  scored.sort((a, b) => b.effectiveScore - a.effectiveScore);
  return scored.slice(0, 10) as PatternLearning[]; // Reduced from 15 to keep prompts shorter
}

async function getAvoidPatterns(
  supabaseUrl: string,
  supabaseKey: string,
  provider: string
): Promise<AvoidPattern[]> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data, error } = await supabase
    .from("prompt_learnings")
    .select("pattern_type, pattern_value, failed_uses")
    .eq("provider", provider)
    .eq("avoid_pattern", true)
    .order("failed_uses", { ascending: false })
    .limit(5); // Reduced from 10

  if (error) {
    console.error("Failed to fetch avoid patterns:", error);
    return [];
  }

  return (data || []) as AvoidPattern[];
}

function buildLearningsHint(
  positivePatterns: PatternLearning[], 
  avoidPatterns: AvoidPattern[],
  provider: VideoProvider
): string {
  // For Runway, keep learnings very minimal
  if (provider === "runway" && positivePatterns.length > 3) {
    positivePatterns = positivePatterns.slice(0, 3);
  }

  const hints: string[] = [];
  
  if (positivePatterns.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const p of positivePatterns) {
      if (!grouped[p.pattern_type]) grouped[p.pattern_type] = [];
      if (grouped[p.pattern_type].length < 2) { // Reduced cap
        grouped[p.pattern_type].push(p.pattern_value);
      }
    }

    const positiveHints: string[] = [];
    if (grouped.camera) positiveHints.push(`Camera: ${grouped.camera.join(", ")}`);
    if (grouped.motion) positiveHints.push(`Motion: ${grouped.motion.join(", ")}`);
    if (grouped.lighting && provider !== "runway") { // Skip lighting for Runway
      positiveHints.push(`Lighting: ${grouped.lighting.join(", ")}`);
    }

    if (positiveHints.length > 0) {
      hints.push("LEARNED (use if relevant):");
      hints.push(...positiveHints);
    }
  }

  if (avoidPatterns.length > 0) {
    const avoidList = avoidPatterns.slice(0, 3).map(p => p.pattern_value);
    hints.push(`AVOID: ${avoidList.join(", ")}`);
  }

  if (hints.length === 0) return "";

  // Much stricter length cap for learnings
  const maxLength = provider === "runway" ? 150 : 250;
  const hintText = hints.join("\n");
  
  if (hintText.length > maxLength) {
    return "\n\n" + hintText.substring(0, maxLength);
  }

  return "\n\n" + hintText;
}

/**
 * Get max tokens based on provider (Runway needs fewer)
 */
function getMaxTokens(provider: VideoProvider | undefined): number {
  if (!provider) return 150;
  switch (provider) {
    case "runway": return 60;  // Very short
    case "luma": return 120;
    case "sora": return 250;
    default: return 150;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { prompt, provider, style_hints } = await req.json() as EnrichRequest;

    if (!prompt || prompt.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get provider-specific system prompt
    const effectiveProvider = provider || "luma"; // Default to Luma if not specified
    let systemPrompt = getProviderSystemPrompt(effectiveProvider);

    // Add learned patterns (but keep them brief)
    if (provider) {
      const [positivePatterns, avoidPatterns] = await Promise.all([
        getLearnedPatterns(supabaseUrl, supabaseServiceKey, provider),
        getAvoidPatterns(supabaseUrl, supabaseServiceKey, provider),
      ]);
      
      const learningsHint = buildLearningsHint(positivePatterns, avoidPatterns, provider);
      if (learningsHint) {
        systemPrompt += learningsHint;
        console.log(`[v2] Applied ${positivePatterns.length} positive, ${avoidPatterns.length} avoid patterns for ${provider}`);
      }
    }

    // Build user message - keep it simple
    let userMessage = `Concept: "${prompt}"`;
    if (style_hints) {
      // For Runway, only add most critical style hint
      if (provider === "runway") {
        const firstHint = style_hints.split(",")[0].trim();
        userMessage += `\nStyle: ${firstHint}`;
      } else {
        userMessage += `\nStyle hints: ${style_hints}`;
      }
    }

    console.log(`[v2] Enriching for ${provider || "general"}: "${prompt.substring(0, 40)}..."`);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7, // Slightly lower for more consistent output
        max_tokens: getMaxTokens(provider),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to enrich prompt", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const gptOutput = data.choices?.[0]?.message?.content?.trim();

    if (!gptOutput) {
      console.error("No content in OpenAI response:", data);
      return new Response(
        JSON.stringify({ 
          error: "No enriched prompt generated", 
          original: prompt, 
          enriched: prompt,
          provider: provider || null,
          schema_version: "v2.0",
          char_count: prompt.length,
          max_chars: PROVIDER_LIMITS[effectiveProvider].maxChars,
          was_compressed: false,
        } as EnrichResponse),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compile the GPT output for the specific provider
    const compiled: CompiledPrompt = compileForProvider(
      effectiveProvider,
      gptOutput,
      prompt
    );

    console.log(`[v2] Result: ${compiled.charCount}/${compiled.maxChars} chars, compressed=${compiled.wasCompressed}`);
    console.log(`[v2] Final: "${compiled.providerPrompt.substring(0, 60)}..."`);

    const result: EnrichResponse = {
      original: prompt,
      enriched: compiled.providerPrompt,      // Provider-optimized final prompt
      full_enrichment: gptOutput,             // Full GPT output for debugging
      provider: provider || null,
      schema_version: compiled.schemaVersion,
      char_count: compiled.charCount,
      max_chars: compiled.maxChars,
      was_compressed: compiled.wasCompressed,
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error enriching prompt:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
