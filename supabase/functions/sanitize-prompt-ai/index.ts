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

// Myth Mode specific word mappings for symbolic transformation
const MYTH_WORD_MAP: Record<string, string> = {
  // Violence → Symbolism
  "kill": "overcome",
  "slay": "vanquish symbolically",
  "slaughter": "the crowd scatters",
  "murder": "a shadow falls",
  "blood": "shadows",
  "gore": "darkness spreads",
  "death": "the light fades",
  "dying": "fading into shadow",
  "dead": "still as stone",
  "attack": "approach",
  "strike": "confront",
  "stab": "gesture toward",
  
  // Weapons → Symbolic Objects
  "sword": "staff",
  "blade": "iron shape",
  "knife": "shadow edge",
  "dagger": "pointed silhouette",
  "gun": "iron shape",
  "pistol": "mechanical shadow",
  "rifle": "long iron form",
  "weapon": "symbolic tool",
  
  // Military → Abstract
  "army": "mass of figures",
  "soldiers": "faceless silhouettes",
  "troops": "marching forms",
  "battle": "confrontation",
  "combat": "struggle",
  "warfare": "great struggle",
  "war": "conflict of shadows",
  "enemy": "challenger",
  "enemies": "challengers",
  "foe": "opposing figure",
  
  // Body → Silhouette
  "face": "silhouette form",
  "eyes": "dark hollows",
  "mouth": "shadowed opening",
  "flesh": "form",
};

const SYSTEM_PROMPT = `You are a video prompt sanitizer for AI video generation. Your job is to rewrite prompts that were blocked by moderation systems.

CORE RULES:
1. Preserve the core creative intent and visual mood
2. Transform blocked content to moderation-safe alternatives:
   - Violence, weapons, combat → dramatic tension, symbolic conflict, confrontation
   - Blood, gore, death → shadows falling, light fading, dramatic moments
   - Explicit actions → implied or symbolic gestures
3. Keep ALL visual style descriptors (silhouette, shadow-puppet, cinematic, etc.)
4. Keep camera/motion directions (slow zoom, pan, dolly, etc.)
5. Maintain approximate length

MYTH MODE RULES (when style="myth"):
You MUST transform to symbolic/abstract language:
- "kill/slay" → "overcome", "the shadows fall"
- "blood/gore" → "shadows", "darkness spreads"
- "sword/weapon" → "staff", "iron shape", "symbolic tool"
- "army/soldiers" → "mass of figures", "faceless silhouettes"
- "battle/combat" → "confrontation", "struggle"
- Any face/body detail → "silhouette", "form", "shadow"
- ALWAYS add: "silhouette only, no facial features, symbolic representation"
- ALWAYS keep: "parchment", "shadow-puppet", "2D", "high contrast"

FILM MODE RULES (when style="film"):
- Prefer dramatic tension over explicit violence
- Use cinematic language: "impact", "aftermath", "confrontation"
- Keep cinematography terms intact

OUTPUT FORMAT (JSON):
{
  "sanitized_prompt": "The rewritten prompt",
  "changes_made": ["original → replacement", ...],
  "confidence": 0.0-1.0,
  "myth_transforms_applied": true/false
}`;

const MYTH_STYLE_REINFORCEMENT = `

[CRITICAL STYLE CONSTRAINT: This is a Myth Mode scene - silhouette animation only, no realistic faces, no detailed eyes, shadow-puppet aesthetic, parchment texture, symbolic representation]`;

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

    const isMythMode = body.style === "myth";
    
    // For Myth Mode, apply programmatic transforms FIRST before AI
    let preProcessedPrompt = body.prompt;
    const programmaticChanges: string[] = [];
    
    if (isMythMode) {
      for (const [original, replacement] of Object.entries(MYTH_WORD_MAP)) {
        const regex = new RegExp(`\\b${original}\\b`, "gi");
        if (regex.test(preProcessedPrompt)) {
          programmaticChanges.push(`${original} → ${replacement}`);
          preProcessedPrompt = preProcessedPrompt.replace(regex, replacement);
        }
      }
      
      // Add Myth style reinforcement if not present
      if (!preProcessedPrompt.includes("silhouette") && !preProcessedPrompt.includes("[STYLE:")) {
        preProcessedPrompt += MYTH_STYLE_REINFORCEMENT;
      }
      
      console.log(`[sanitize-prompt-ai] Myth pre-processing: ${programmaticChanges.length} transforms`);
    }

    // Build the user prompt with context
    let userPrompt = `Rewrite this video generation prompt to be moderation-safe:\n\n"${preProcessedPrompt}"`;
    
    if (body.provider) {
      userPrompt += `\n\nProvider: ${body.provider} (${
        body.provider === "runway" ? "STRICT moderation - be very aggressive, remove all violent/weapon terms" :
        body.provider === "sora" ? "OpenAI moderation - avoid violence, weapons, explicit content" :
        "Luma moderation - moderate strictness"
      })`;
    }
    
    if (body.style) {
      userPrompt += `\n\nVisual style to preserve: ${
        body.style === "myth" ? "MYTH MODE - silhouette animation, shadow-puppet aesthetic, symbolic/abstract representation, parchment texture, NO realistic faces, NO detailed eyes. Transform all violence to symbolic gestures." :
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
    
    // For Myth Mode, explicitly list what was already transformed
    if (programmaticChanges.length > 0) {
      userPrompt += `\n\nAlready transformed (verify these are in the output): ${programmaticChanges.join(", ")}`;
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
