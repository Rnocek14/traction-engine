/**
 * Compile Story Script
 * 
 * Takes scene narrations and rewrites them into a cohesive narrative script
 * using GPT-4o. Ensures consistent POV, tense, pacing, and flow.
 * 
 * Input: story_job_id
 * Output: compiled_script with scene_segments for timing alignment
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  
  const sceneList = scenes
    .map((s, i) => `Scene ${i + 1} (${s.beat_type || "scene"}, ~${s.duration_seconds || 5}s):\n"${s.narration}"`)
    .join("\n\n");

  return `${styleGuide}

${title ? `Story Title: "${title}"` : ""}

You have ${scenes.length} scene narrations that need to be compiled into a single cohesive script.
Each scene's narration will be spoken while that scene plays, so timing matters.

SCENE NARRATIONS:
${sceneList}

YOUR TASK:
1. Rewrite these into a unified narrative that flows naturally
2. Maintain the scene structure (same number of segments, similar lengths)
3. Ensure consistent voice, tense, and style throughout
4. Add brief pauses between scenes (marked with "...")
5. The total should be speakable in roughly the same time as the originals

OUTPUT FORMAT:
Return a JSON object with:
{
  "compiled_script": "The full narration text...",
  "segments": [
    {"scene_index": 0, "text": "Segment for scene 1..."},
    {"scene_index": 1, "text": "Segment for scene 2..."}
  ]
}

The segments array must have exactly ${scenes.length} items, one per scene.
Each segment's text should be roughly similar in length to the original scene narration.
`;
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
        narration?: string;
        beat_type?: string;
        duration_seconds?: number;
      }>;
    };

    if (!storyboard?.scenes?.length) {
      throw new Error("Story has no scenes");
    }

    // Extract scene narrations
    const sceneNarrations: SceneNarration[] = storyboard.scenes
      .map((scene, idx) => ({
        scene_index: scene.index ?? idx,
        narration: scene.narration || "",
        beat_type: scene.beat_type,
        duration_seconds: scene.duration_seconds,
      }))
      .filter(s => s.narration.trim().length > 0);

    if (sceneNarrations.length === 0) {
      throw new Error("No narrations found in scenes");
    }

    // Concatenate raw narration for storage
    const rawNarration = sceneNarrations.map(s => s.narration).join(" ");

    // Create voiceover record in pending state
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
            content: "You compile scene narrations into cohesive scripts. Output valid JSON only.",
          },
          { role: "user", content: compilationPrompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
      }),
    });

    if (!llmResponse.ok) {
      const errText = await llmResponse.text();
      // Update voiceover with error
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

    let compiledResult: { compiled_script: string; segments: Array<{ scene_index: number; text: string }> };
    try {
      compiledResult = JSON.parse(rawContent);
    } catch {
      await supabase
        .from("story_voiceovers")
        .update({ status: "failed", error: `Invalid JSON: ${rawContent.slice(0, 200)}` })
        .eq("id", voiceover.id);
      throw new Error(`Invalid JSON from LLM: ${rawContent.slice(0, 200)}`);
    }

    // Build scene segments with character positions and timing estimates
    const sceneSegments: SceneSegment[] = [];
    let charPosition = 0;

    for (const segment of compiledResult.segments) {
      const text = segment.text.trim();
      const wordCount = text.split(/\s+/).length;
      // ~2.5 words/sec for calm narration
      const estimatedDurationMs = Math.ceil((wordCount / 2.5) * 1000);

      sceneSegments.push({
        scene_index: segment.scene_index,
        text,
        char_start: charPosition,
        char_end: charPosition + text.length,
        estimated_duration_ms: estimatedDurationMs,
      });

      charPosition += text.length + 1; // +1 for space
    }

    // Build predicted timing
    const predictedTiming = sceneSegments.map((seg, idx) => {
      const startMs = sceneSegments.slice(0, idx).reduce((sum, s) => sum + s.estimated_duration_ms + 1500, 0);
      return {
        scene_index: seg.scene_index,
        start_ms: startMs,
        end_ms: startMs + seg.estimated_duration_ms,
      };
    });

    // Update voiceover with compiled script
    const { error: updateError } = await supabase
      .from("story_voiceovers")
      .update({
        compiled_script: compiledResult.compiled_script,
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

    console.log(`[compile-script] Compiled script: ${compiledResult.compiled_script.length} chars, ${sceneSegments.length} segments`);

    return new Response(
      JSON.stringify({
        success: true,
        voiceover_id: voiceover.id,
        compiled_script: compiledResult.compiled_script,
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
