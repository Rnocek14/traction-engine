/**
 * Compile Story Script
 * 
 * Takes scene narrations and rewrites them into a cohesive narrative script
 * using GPT-4o. Ensures consistent POV, tense, pacing, and flow.
 * 
 * CRITICAL: This function builds a canonical_text that MUST be used exactly
 * by generate-story-voiceover for alignment to work correctly.
 * 
 * Input: story_job_id
 * Output: compiled_script (canonical_text) with scene_segments for timing alignment
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCompileQualityRules } from "../_shared/content-quality.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SceneNarration {
  scene_index: number;
  narration: string;
  beat_type?: string;
  duration_seconds?: number;
}

interface SceneSegment {
  scene_index: number;
  text: string;
  char_start: number;
  char_end: number;
  estimated_duration_ms: number;
}

interface CompileRequest {
  story_job_id: string;
  voice_id?: string;
  voice_name?: string;
  voice_settings?: Record<string, unknown>;
}

// Separator used between scenes in canonical text - must be consistent
const SCENE_SEPARATOR = " ... ";

// Story type to narrative style mapping
const NARRATIVE_STYLES: Record<string, string> = {
  myth: `You are a mythic narrator in the style of ancient fables and legends.
Your voice is:
- Third-person omniscient ("There once was...", "The seeker walked...")
- Timeless and poetic, avoiding modern language
- Measured and deliberate, with natural pauses
- Moralistic without being preachy
- Evocative of shadow-puppet theater narration

Structure:
- Begin with "There once was..." or similar fable opening
- Each scene transition should flow naturally
- End with a moral or reflection ("And so it was understood...")`,

  film_continuity: `You are a documentary narrator.
Your voice is:
- Third-person observational
- Present tense preferred for immediacy
- Clear and descriptive
- Emotionally restrained but engaging

Structure:
- Scene transitions should be cinematic
- Avoid repetitive sentence structures
- Build tension through pacing`,

  short_story: `You are a dramatic narrator.
Your voice is:
- Third-person close POV
- Vivid and sensory
- Dynamic pacing that matches action
- Emotionally resonant

Structure:
- Hook the audience immediately
- Build through rising action
- End with impact`,

  default: `You are a professional narrator.
Your voice is clear, engaging, and consistent.
Maintain a single POV and tense throughout.
Ensure smooth transitions between scenes.`,
};

function buildCompilationPrompt(
  scenes: SceneNarration[],
  storyType: string,
  title: string | null
): string {
  const styleGuide = NARRATIVE_STYLES[storyType] || NARRATIVE_STYLES.default;
  const qualityRules = buildCompileQualityRules(title || "");
  
  const sceneList = scenes
    .map((s, i) => `Scene ${i + 1} (${s.beat_type || "scene"}, ~${s.duration_seconds || 5}s):\n"${s.narration}"`)
    .join("\n\n");

  return `${styleGuide}

${title ? `Story Title: "${title}"` : ""}
${qualityRules}

You have ${scenes.length} scene narrations that need to be compiled into a single cohesive script.
Each scene's narration will be spoken while that scene plays, so timing matters.

SCENE NARRATIONS:
${sceneList}

YOUR TASK:
1. Rewrite these into a unified narrative that flows naturally
2. You MUST return EXACTLY ${scenes.length} segments - one per scene, in order
3. Even if a scene has minimal narration, return a segment for it (can be a short pause phrase like "...")
4. Ensure consistent voice, tense, and style throughout
5. Each segment should be roughly similar in length to the original scene narration
6. CRITICAL: If any segment contains generic motivational filler, REPLACE it with specific, actionable content
7. Every value segment must teach something concrete — a technique, fact, or step

OUTPUT FORMAT:
Return a JSON object with:
{
  "segments": [
    {"scene_index": 0, "text": "Segment for scene 1..."},
    {"scene_index": 1, "text": "Segment for scene 2..."}
  ]
}

CRITICAL: The segments array MUST have exactly ${scenes.length} items, in order from 0 to ${scenes.length - 1}.
`;
}

/**
 * Build canonical text from segments with consistent separator.
 * This exact text will be sent to ElevenLabs for TTS.
 * char_start/char_end are computed against this canonical string.
 */
function buildCanonicalTextFromSegments(
  segments: Array<{ scene_index: number; text: string }>
): { canonicalText: string; sceneSegments: SceneSegment[] } {
  const sceneSegments: SceneSegment[] = [];
  let canonicalText = "";
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const text = segment.text.trim() || "(pause)"; // Never empty - use placeholder
    const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
    // ~2.5 words/sec for calm narration
    const estimatedDurationMs = Math.max(500, Math.ceil((wordCount / 2.5) * 1000));
    
    const charStart = canonicalText.length;
    canonicalText += text;
    const charEnd = canonicalText.length;
    
    sceneSegments.push({
      scene_index: segment.scene_index,
      text,
      char_start: charStart,
      char_end: charEnd,
      estimated_duration_ms: estimatedDurationMs,
    });
    
    // Add separator after each segment except the last
    if (i < segments.length - 1) {
      canonicalText += SCENE_SEPARATOR;
    }
  }
  
  return { canonicalText, sceneSegments };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body: CompileRequest = await req.json();

    if (!body.story_job_id) {
      throw new Error("story_job_id is required");
    }

    // Fetch story with storyboard
    const { data: story, error: storyError } = await supabase
      .from("story_jobs")
      .select("*")
      .eq("id", body.story_job_id)
      .single();

    if (storyError || !story) {
      throw new Error(`Story not found: ${storyError?.message}`);
    }

    const storyboard = story.storyboard_json as {
      scenes?: Array<{
        index?: number;
        sequence_index?: number;
        narration?: string;
        narration_line?: string;
        beat_type?: string;
        beat_role?: string;
        role?: string;
        duration_seconds?: number;
        duration_target?: number;
      }>;
    };

    if (!storyboard?.scenes?.length) {
      throw new Error("Story has no scenes");
    }

    // Extract ALL scene narrations - check both field names (narration_line from template, narration from legacy)
    // This ensures segment count === scene count
    const sceneNarrations: SceneNarration[] = storyboard.scenes.map((scene, idx) => ({
      scene_index: scene.sequence_index ?? scene.index ?? idx,
      narration: scene.narration_line || scene.narration || "(pause)", // narration_line is the template field
      beat_type: scene.beat_role || scene.beat_type || scene.role,
      duration_seconds: scene.duration_target || scene.duration_seconds,
    }));

    console.log(`[compile-script] Scene narrations extracted:`, sceneNarrations.map(s => `[${s.scene_index}] "${s.narration.slice(0, 60)}..."`));

    // Concatenate raw narration for storage
    const rawNarration = sceneNarrations.map(s => s.narration).join(" ");

    // Create voiceover record in pending state
    // Note: The trigger ensure_single_active_voiceover_trigger will deactivate previous active voiceovers
    const { data: voiceover, error: voiceoverError } = await supabase
      .from("story_voiceovers")
      .insert({
        story_job_id: body.story_job_id,
        raw_narration: rawNarration,
        voice_id: body.voice_id || "JBFqnCBsd6RMkjVDRZzb", // Default: George
        voice_name: body.voice_name || "George",
        voice_settings: body.voice_settings || {
          stability: 0.7,
          similarity_boost: 0.75,
          style: 0.5,
        },
        status: "compiling",
        is_active: true,
      })
      .select()
      .single();

    if (voiceoverError || !voiceover) {
      throw new Error(`Failed to create voiceover record: ${voiceoverError?.message}`);
    }

    console.log(`[compile-script] Created voiceover ${voiceover.id} for story ${body.story_job_id}`);
    console.log(`[compile-script] Compiling ${sceneNarrations.length} scenes, story_type=${story.story_type}`);

    // Build compilation prompt
    const compilationPrompt = buildCompilationPrompt(
      sceneNarrations,
      story.story_type,
      story.title
    );

    // Call GPT-4o for cohesive rewrite
    const llmResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You compile scene narrations into cohesive scripts. Output valid JSON only. You MUST return exactly one segment per scene.",
          },
          { role: "user", content: compilationPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      await supabase
        .from("story_voiceovers")
        .update({ status: "failed", error: `OpenAI error: ${errText}` })
        .eq("id", voiceover.id);
      throw new Error(`OpenAI error: ${errText}`);
    }

    const llmData = await llmResponse.json();
    const rawContent = llmData.choices?.[0]?.message?.content;

    if (!rawContent) {
      await supabase
        .from("story_voiceovers")
        .update({ status: "failed", error: "No content from LLM" })
        .eq("id", voiceover.id);
      throw new Error("No content from LLM");
    }

    let compiledResult: { segments: Array<{ scene_index: number; text: string }> };
    try {
      compiledResult = JSON.parse(rawContent);
    } catch {
      await supabase
        .from("story_voiceovers")
        .update({ status: "failed", error: `Invalid JSON: ${rawContent.slice(0, 200)}` })
        .eq("id", voiceover.id);
      throw new Error(`Invalid JSON from LLM: ${rawContent.slice(0, 200)}`);
    }

    // Validate segment count matches scene count
    if (!compiledResult.segments || compiledResult.segments.length !== sceneNarrations.length) {
      const errorMsg = `Segment count mismatch: expected ${sceneNarrations.length}, got ${compiledResult.segments?.length || 0}`;
      await supabase
        .from("story_voiceovers")
        .update({ status: "failed", error: errorMsg })
        .eq("id", voiceover.id);
      throw new Error(errorMsg);
    }

    // Build canonical text from segments
    // This is the EXACT text that will be sent to ElevenLabs
    const { canonicalText, sceneSegments } = buildCanonicalTextFromSegments(compiledResult.segments);

    // Build predicted timing with rolling accumulator (O(n) instead of O(n²))
    let accumulatedMs = 0;
    const predictedTiming = sceneSegments.map((seg) => {
      const startMs = accumulatedMs;
      const endMs = startMs + seg.estimated_duration_ms;
      accumulatedMs = endMs + 1500; // 1.5s pause between scenes
      return {
        scene_index: seg.scene_index,
        start_ms: startMs,
        end_ms: endMs,
      };
    });

    // Update voiceover with compiled script (canonical text)
    const { error: updateError } = await supabase
      .from("story_voiceovers")
      .update({
        compiled_script: canonicalText, // This is the canonical text to send to TTS
        scene_segments: sceneSegments,
        predicted_timing: predictedTiming,
        status: "compiled", // Ready for TTS generation
      })
      .eq("id", voiceover.id);

    if (updateError) {
      throw new Error(`Failed to update voiceover: ${updateError.message}`);
    }

    // Update story_jobs with active voiceover reference
    await supabase
      .from("story_jobs")
      .update({ active_voiceover_id: voiceover.id })
      .eq("id", body.story_job_id);

    console.log(`[compile-script] Canonical text: ${canonicalText.length} chars, ${sceneSegments.length} segments`);

    return new Response(
      JSON.stringify({
        success: true,
        voiceover_id: voiceover.id,
        compiled_script: canonicalText,
        scene_segments: sceneSegments,
        predicted_timing: predictedTiming,
        total_estimated_duration_ms: predictedTiming.length > 0 
          ? predictedTiming[predictedTiming.length - 1].end_ms 
          : 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error("[compile-script] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
