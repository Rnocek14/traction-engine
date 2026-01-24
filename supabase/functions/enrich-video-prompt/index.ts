/**
 * Enrich video prompts using GPT-4o + learned patterns
 * Features:
 * - Provider-specific optimization
 * - Time-decayed pattern learning
 * - Negative pattern avoidance
 * - Capped learned influence (max 25% of system prompt)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EnrichRequest {
  prompt: string;
  provider?: "sora" | "runway" | "luma";
  style_hints?: string;
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

const SYSTEM_PROMPT = `You are a cinematographer writing video generation prompts for AI video models.

Given a concept, create a rich, photorealistic video prompt that includes:
1. SUBJECT: Who/what is the main focus? Be specific (person, vehicle, animal, object).
2. ACTION: What motion is happening? Describe the movement dynamically.
3. ENVIRONMENT: Where is this? Time of day, weather, setting details.
4. CAMERA: Shot type (close-up, wide, tracking, aerial), movement (pan, dolly, static, handheld).
5. LIGHTING: Natural light, golden hour, dramatic shadows, neon, etc.
6. MOOD: The emotional feel of the scene.

CRITICAL RULES:
- Always describe REAL, PHOTOREALISTIC content only
- NEVER use words like "animated", "3D render", "cartoon", "illustration", "CGI", "digital art"
- Focus on ONE continuous 5-10 second moment
- Keep under 100 words total
- Make it visually specific and filmable
- Describe what the CAMERA SEES, not abstract concepts
- Include motion verbs: glides, rushes, sweeps, drifts, accelerates
- Avoid UI elements, text overlays, or screen recordings

Output ONLY the enriched prompt, nothing else.`;

const PROVIDER_HINTS: Record<string, string> = {
  sora: "\n\nOptimize for Sora: Use detailed 'Director's Brief' style with specific lens choices, color grading hints, and cinematic terminology.",
  runway: "\n\nOptimize for Runway: Focus on motion and action. Be concise but motion-rich. Emphasize what MOVES and HOW.",
  luma: "\n\nOptimize for Luma: Emphasize physics-based motion, environmental interactions, and natural movement. Describe how elements flow and interact.",
};

// Time decay function: patterns from 30+ days ago get 50% weight
function calculateTimeDecay(lastSuccessAt: string | null): number {
  if (!lastSuccessAt) return 0.5;
  
  const daysSince = (Date.now() - new Date(lastSuccessAt).getTime()) / (1000 * 60 * 60 * 24);
  
  if (daysSince <= 7) return 1.0;      // Full weight for first week
  if (daysSince <= 14) return 0.9;     // 90% for second week
  if (daysSince <= 30) return 0.75;    // 75% for first month
  if (daysSince <= 60) return 0.5;     // 50% for second month
  return 0.25;                          // 25% for older patterns
}

// Calculate effective score with time decay
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
    .limit(30); // Fetch more, then filter by score

  if (error) {
    console.error("Failed to fetch learned patterns:", error);
    return [];
  }

  if (!data || data.length === 0) return [];

  // Sort by effective score (includes time decay)
  const scored = data.map(p => ({
    ...p,
    effectiveScore: calculateEffectiveScore(p as PatternLearning)
  }));
  
  scored.sort((a, b) => b.effectiveScore - a.effectiveScore);
  
  // Return top 15 by effective score
  return scored.slice(0, 15) as PatternLearning[];
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
    .limit(10);

  if (error) {
    console.error("Failed to fetch avoid patterns:", error);
    return [];
  }

  return (data || []) as AvoidPattern[];
}

function buildLearningsHint(
  positivePatterns: PatternLearning[], 
  avoidPatterns: AvoidPattern[]
): string {
  const hints: string[] = [];
  
  // Positive patterns (preferred)
  if (positivePatterns.length > 0) {
    const grouped: Record<string, string[]> = {};
    for (const p of positivePatterns) {
      if (!grouped[p.pattern_type]) grouped[p.pattern_type] = [];
      if (grouped[p.pattern_type].length < 3) { // Cap at 3 per type
        grouped[p.pattern_type].push(p.pattern_value);
      }
    }

    const positiveHints: string[] = [];
    if (grouped.camera) positiveHints.push(`Camera: ${grouped.camera.join(", ")}`);
    if (grouped.lighting) positiveHints.push(`Lighting: ${grouped.lighting.join(", ")}`);
    if (grouped.motion) positiveHints.push(`Motion: ${grouped.motion.join(", ")}`);
    if (grouped.mood) positiveHints.push(`Mood: ${grouped.mood.join(", ")}`);
    if (grouped.semantic_trait) positiveHints.push(`Traits: ${grouped.semantic_trait.join(", ")}`);
    if (grouped.style_hint) positiveHints.push(`Styles: ${grouped.style_hint.join(", ")}`);

    if (positiveHints.length > 0) {
      hints.push("LEARNED PREFERENCES (use when appropriate):");
      hints.push(...positiveHints);
    }
  }

  // Negative patterns (avoid)
  if (avoidPatterns.length > 0) {
    const avoidList = avoidPatterns
      .slice(0, 5) // Cap at 5 avoid patterns
      .map(p => p.pattern_value);
    
    hints.push("");
    hints.push("AVOID FOR THIS PROVIDER:");
    hints.push(`- ${avoidList.join(", ")}`);
  }

  if (hints.length === 0) return "";

  // Cap total hint length (roughly 25% of base system prompt)
  const hintText = hints.join("\n");
  const maxLength = 400; // ~25% of base prompt tokens
  
  if (hintText.length > maxLength) {
    return "\n\n" + hintText.substring(0, maxLength) + "...";
  }

  return "\n\n" + hintText;
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

    // Build system prompt with provider hints + learned patterns
    let systemPrompt = SYSTEM_PROMPT;
    if (provider && PROVIDER_HINTS[provider]) {
      systemPrompt += PROVIDER_HINTS[provider];
    }

    // Fetch learned patterns (both positive and negative)
    if (provider) {
      const [positivePatterns, avoidPatterns] = await Promise.all([
        getLearnedPatterns(supabaseUrl, supabaseServiceKey, provider),
        getAvoidPatterns(supabaseUrl, supabaseServiceKey, provider),
      ]);
      
      const learningsHint = buildLearningsHint(positivePatterns, avoidPatterns);
      if (learningsHint) {
        systemPrompt += learningsHint;
        console.log(`Applied ${positivePatterns.length} positive, ${avoidPatterns.length} avoid patterns for ${provider}`);
      }
    }

    // Build user message
    let userMessage = `Concept: "${prompt}"`;
    if (style_hints) {
      userMessage += `\n\nStyle hints to incorporate: ${style_hints}`;
    }

    console.log(`Enriching prompt for ${provider || "general"}: "${prompt.substring(0, 50)}..."`);

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
        temperature: 0.8,
        max_tokens: 200,
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
    const enrichedPrompt = data.choices?.[0]?.message?.content?.trim();

    if (!enrichedPrompt) {
      console.error("No content in OpenAI response:", data);
      return new Response(
        JSON.stringify({ error: "No enriched prompt generated", original: prompt, enriched: prompt }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Enriched: "${enrichedPrompt.substring(0, 80)}..."`);

    return new Response(
      JSON.stringify({
        original: prompt,
        enriched: enrichedPrompt,
        provider: provider || null,
      }),
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
