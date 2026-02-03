/**
 * AI Prompt Sanitizer
 * 
 * Uses GPT to intelligently rewrite prompts that were blocked by moderation.
 * Preserves creative intent while removing/rephrasing trigger content.
 * 
 * Use cases:
 * - Retry after moderation block
 * - Pre-sanitize high-risk prompts before submission
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SanitizeRequest {
  prompt: string;
  provider?: "sora" | "runway" | "luma";
  context?: string; // Story context to preserve
  error_message?: string; // Original moderation error for context
  style?: "myth" | "film" | "default"; // Visual style to preserve
}

interface SanitizeResponse {
  success: boolean;
  original_prompt: string;
  sanitized_prompt: string;
  changes_made: string[];
  confidence: number;
  error?: string;
}

const SYSTEM_PROMPT = `You are a video prompt sanitizer. Your job is to rewrite prompts that were blocked by AI video generation moderation systems.

RULES:
1. Preserve the core creative intent and visual description
2. Remove or rephrase any content that could trigger moderation:
   - Violence, weapons, combat → dramatic tension, conflict, confrontation
   - Blood, gore, death → aftermath, impact, fall, dramatic moments
   - Explicit actions → implied or symbolic actions
3. Keep the visual style descriptors intact (silhouette, shadow-puppet, cinematic, etc.)
4. Maintain the same approximate length
5. Keep camera/motion directions (slow zoom, pan, dolly, etc.)
6. For myth/fable style: emphasize symbolism and abstraction

OUTPUT FORMAT:
Return a JSON object with:
- sanitized_prompt: The rewritten prompt
- changes_made: Array of what you changed (e.g., "sword → staff", "battle → confrontation")
- confidence: 0-1 score of how likely this will pass moderation

Example:
Input: "A warrior draws his sword and charges into battle, slaying enemies"
Output: {
  "sanitized_prompt": "A warrior raises a staff and rushes into confrontation, overcoming challengers",
  "changes_made": ["sword → staff", "charges into battle → rushes into confrontation", "slaying enemies → overcoming challengers"],
  "confidence": 0.85
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const body: SanitizeRequest = await req.json();

    if (!body.prompt) {
      throw new Error("prompt is required");
    }

    // Build the user prompt with context
    let userPrompt = `Rewrite this video generation prompt to be moderation-safe:\n\n"${body.prompt}"`;
    
    if (body.provider) {
      userPrompt += `\n\nProvider: ${body.provider} (${
        body.provider === "runway" ? "stricter moderation - be more aggressive with changes" :
        body.provider === "sora" ? "OpenAI moderation - avoid violence and weapons" :
        "Luma moderation - moderate strictness"
      })`;
    }
    
    if (body.style) {
      userPrompt += `\n\nVisual style to preserve: ${
        body.style === "myth" ? "Myth mode - silhouette, shadow-puppet, symbolic, fable-like" :
        body.style === "film" ? "Film mode - cinematic, dramatic, narrative-focused" :
        "Standard cinematic video"
      }`;
    }
    
    if (body.error_message) {
      userPrompt += `\n\nOriginal moderation error: "${body.error_message}"`;
    }
    
    if (body.context) {
      userPrompt += `\n\nStory context to maintain: ${body.context}`;
    }

    console.log(`[sanitize-prompt-ai] Processing prompt (${body.prompt.length} chars) for ${body.provider || "unknown"}`);

    // Call GPT-4o-mini for fast, cost-effective rewriting
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3, // Low temperature for consistent output
        response_format: { type: "json_object" },
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from OpenAI");
    }

    // Parse the JSON response
    let parsed: { sanitized_prompt: string; changes_made: string[]; confidence: number };
    try {
      parsed = JSON.parse(content);
    } catch {
      // If JSON parsing fails, treat the whole response as the sanitized prompt
      parsed = {
        sanitized_prompt: content,
        changes_made: ["Full rewrite by AI"],
        confidence: 0.7,
      };
    }

    console.log(`[sanitize-prompt-ai] Sanitized with ${parsed.changes_made.length} changes, confidence: ${parsed.confidence}`);

    const result: SanitizeResponse = {
      success: true,
      original_prompt: body.prompt,
      sanitized_prompt: parsed.sanitized_prompt,
      changes_made: parsed.changes_made,
      confidence: parsed.confidence,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[sanitize-prompt-ai] Error:", error.message);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        original_prompt: "",
        sanitized_prompt: "",
        changes_made: [],
        confidence: 0,
      } as SanitizeResponse),
      { 
        status: 400, 
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
