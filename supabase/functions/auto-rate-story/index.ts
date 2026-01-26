import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const ANALYZER_VERSION = "story-v1.0";

// ═══════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════

interface StoryAnalysisResult {
  overall_flow_score: number;
  character_continuity: number;
  environment_consistency: number;
  motion_logic: number;
  prompt_execution: number;
  weak_scenes: number[];
  failure_patterns: string[];
  recommendations: string[];
  scene_scores: Array<{
    index: number;
    continuity_score: number;
    continuity_notes: string[];
  }>;
}

interface SceneData {
  index: number;
  prompt: string;
  thumbnail_url: string | null;
  spritesheet_url: string | null;
  provider: string;
  status: string;
  video_job_id: string;
}

// ═══════════════════════════════════════════════════════════════════
// JSON PARSING HELPER
// ═══════════════════════════════════════════════════════════════════

function safeJsonParse<T>(raw: string): T | null {
  const trimmed = raw.trim();
  try { return JSON.parse(trimmed) as T; } catch { /* ignore */ }
  const m = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m?.[1]) {
    try { return JSON.parse(m[1]) as T; } catch { /* ignore */ }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)) as T; } catch { /* ignore */ }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// STORY FAILURE TAXONOMY
// ═══════════════════════════════════════════════════════════════════

const FAILURE_TAXONOMY = {
  identity_drift: {
    pattern: /identity.?drift|character.?change|person.?morph|different.?person/i,
    mitigation: "Inject character anchor + 'maintain exact appearance' constraint",
  },
  action_discontinuity: {
    pattern: /discontinu|doesn't.?follow|no.?connection|random.?action|illogical/i,
    mitigation: "Force end-state clause in scene N and start-from continuation in N+1",
  },
  physics_violation: {
    pattern: /physics|regenerat|impossible|defy|unrealistic.?motion/i,
    mitigation: "Simplify to single-action beat, remove collision/debris wording",
  },
  location_reset: {
    pattern: /location.?change|different.?place|setting.?shift|environment.?reset/i,
    mitigation: "Lock environment anchor, forbid scene relocation unless explicit",
  },
  wardrobe_drift: {
    pattern: /wardrobe|clothing.?change|outfit|costume.?differ/i,
    mitigation: "Add explicit wardrobe lock in character anchor",
  },
  prop_inconsistency: {
    pattern: /prop|object.?disappear|item.?change|tool.?different/i,
    mitigation: "List key props in continuity anchors with descriptions",
  },
};

function categorizeFailures(rawPatterns: string[]): string[] {
  const categorized: string[] = [];
  
  for (const pattern of rawPatterns) {
    let matched = false;
    for (const [key, config] of Object.entries(FAILURE_TAXONOMY)) {
      if (config.pattern.test(pattern)) {
        categorized.push(`${key}: ${pattern}`);
        matched = true;
        break;
      }
    }
    if (!matched) {
      categorized.push(pattern);
    }
  }
  
  return categorized;
}

function generateRecommendations(failurePatterns: string[]): string[] {
  const recommendations: string[] = [];
  const seenMitigations = new Set<string>();
  
  for (const pattern of failurePatterns) {
    for (const [key, config] of Object.entries(FAILURE_TAXONOMY)) {
      if (pattern.toLowerCase().includes(key) && !seenMitigations.has(key)) {
        recommendations.push(config.mitigation);
        seenMitigations.add(key);
      }
    }
  }
  
  // Add general recommendations if few specific ones
  if (recommendations.length < 2) {
    if (failurePatterns.some(p => p.toLowerCase().includes("motion") || p.toLowerCase().includes("action"))) {
      recommendations.push("Consider using Sora for atmospheric/fantasy content with simpler motion beats");
    }
    if (failurePatterns.length > 3) {
      recommendations.push("Story has multiple failure modes - consider regenerating with simplified prompts");
    }
  }
  
  return recommendations.slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════
// VLM STORY ANALYSIS
// ═══════════════════════════════════════════════════════════════════

async function analyzeStoryWithVLM(
  scenes: SceneData[],
  storyTitle: string,
  openaiKey: string
): Promise<StoryAnalysisResult> {
  // Build image content for each scene
  const imageContents: Array<{ type: "image_url"; image_url: { url: string; detail: "high" | "low" } }> = [];
  const sceneDescriptions: string[] = [];
  
  for (const scene of scenes) {
    const imageUrl = scene.spritesheet_url || scene.thumbnail_url;
    if (imageUrl) {
      imageContents.push({
        type: "image_url",
        image_url: { url: imageUrl, detail: scene.spritesheet_url ? "high" : "low" }
      });
    }
    sceneDescriptions.push(`Scene ${scene.index + 1} [${scene.provider}]: "${scene.prompt}"`);
  }
  
  if (imageContents.length < 2) {
    throw new Error("Need at least 2 scene images to analyze story flow");
  }

  const systemPrompt = `You are a film editor analyzing a multi-scene AI-generated video sequence for NARRATIVE CONTINUITY and QUALITY.

STORY CONTEXT:
Title: "${storyTitle}"
${sceneDescriptions.join("\n")}

EVALUATION DIMENSIONS (0-100 each):

1. NARRATIVE FLOW: Does Scene 2 logically follow Scene 1? Is there coherent story progression?
   - 90-100: Perfect cause-and-effect, natural story beats
   - 70-89: Generally follows, minor logical gaps
   - 50-69: Some connection but awkward transitions
   - <50: Random sequence, no narrative logic

2. CHARACTER CONTINUITY: Same person/entity throughout?
   - Check: Face, body type, clothing, hair, distinctive features
   - 90-100: Identical across all scenes
   - 70-89: Minor variations but recognizably same
   - 50-69: Noticeable drift but still "similar"
   - <50: Different person/entity

3. ENVIRONMENT CONSISTENCY: Same location where expected?
   - Check: Background, lighting direction, time of day, key landmarks
   - Penalize unexplained location jumps

4. MOTION LOGIC: Are actions physically plausible?
   - Watch for: Objects regenerating, impossible physics, teleporting, limbs in wrong places
   - High score = natural, believable movement

5. PROMPT EXECUTION: Did complex prompts execute correctly?
   - Did multi-action scenes deliver all requested elements?
   - Did specific details from prompts appear?

OUTPUT FORMAT (JSON only):
{
  "overall_flow_score": <0-100>,
  "character_continuity": <0-100>,
  "environment_consistency": <0-100>,
  "motion_logic": <0-100>,
  "prompt_execution": <0-100>,
  "weak_scenes": [<0-indexed scene numbers that break the chain>],
  "failure_patterns": ["<specific issues like 'identity_drift in scene 3', 'physics_violation: wall regenerates'>"],
  "scene_scores": [
    {"index": 0, "continuity_score": <0-100>, "continuity_notes": ["<issues>"]},
    ...
  ]
}

Be STRICT. Most AI stories should score 50-75. Only exceptional continuity gets 85+.
Focus on WHERE the chain breaks, not just that it did.`;

  const userContent: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "high" | "low" } }> = [
    { type: "text", text: `Analyze these ${scenes.length} scenes in sequence order. Identify continuity breaks and narrative flow issues.` },
    ...imageContents
  ];

  // Add timeout for API call
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
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
          { role: "user", content: userContent },
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("[auto-rate-story] OpenAI error body:", errorBody);
      throw new Error(`OpenAI API failed: ${response.status} - ${errorBody.slice(0, 200)}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content || content.trim() === "") {
      console.error("[auto-rate-story] Empty VLM response");
      throw new Error("VLM returned empty response");
    }
    
    const parsed = safeJsonParse<StoryAnalysisResult>(content);
    
    if (!parsed) {
      console.error("[auto-rate-story] Failed to parse VLM response:", content.slice(0, 500));
      throw new Error("VLM did not return valid JSON");
    }

    // Normalize and validate scores
    return {
      overall_flow_score: Math.max(0, Math.min(100, parsed.overall_flow_score || 50)),
      character_continuity: Math.max(0, Math.min(100, parsed.character_continuity || 50)),
      environment_consistency: Math.max(0, Math.min(100, parsed.environment_consistency || 50)),
      motion_logic: Math.max(0, Math.min(100, parsed.motion_logic || 50)),
      prompt_execution: Math.max(0, Math.min(100, parsed.prompt_execution || 50)),
      weak_scenes: Array.isArray(parsed.weak_scenes) ? parsed.weak_scenes.filter(n => typeof n === "number") : [],
      failure_patterns: Array.isArray(parsed.failure_patterns) ? parsed.failure_patterns.map(String).slice(0, 10) : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.map(String).slice(0, 5) : [],
      scene_scores: Array.isArray(parsed.scene_scores) 
        ? parsed.scene_scores.map(s => ({
            index: s.index ?? 0,
            continuity_score: Math.max(0, Math.min(100, s.continuity_score || 50)),
            continuity_notes: Array.isArray(s.continuity_notes) ? s.continuity_notes.map(String) : [],
          }))
        : [],
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("OpenAI API request timed out after 60s");
    }
    throw err;
  }

}

// ═══════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  console.log(`[auto-rate-story][${requestId}] Starting`);

  try {
    // Auth check - support both cron and direct calls
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = Deno.env.get("CRON_SECRET");
    const authHeader = req.headers.get("authorization");
    
    const isCronAuth = cronSecret && expectedSecret && cronSecret === expectedSecret;
    const hasApiKey = authHeader?.includes("Bearer");
    
    if (!isCronAuth && !hasApiKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!openaiKey) {
      throw new Error("OPENAI_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { story_id, batch_mode, limit = 5 } = body;

    let storiesToAnalyze: Array<{ id: string; title: string }> = [];

    if (story_id) {
      // Single story mode
      const { data: story, error } = await supabase
        .from("story_jobs")
        .select("id, title")
        .eq("id", story_id)
        .maybeSingle();

      if (error || !story) {
        throw new Error(`Story not found: ${story_id}`);
      }
      storiesToAnalyze = [{ id: story.id, title: story.title || "Untitled" }];
    } else if (batch_mode) {
      // Batch mode: find completed stories without analysis
      const { data: stories, error } = await supabase
        .from("story_jobs")
        .select("id, title, total_clips, completed_clips")
        .eq("status", "done")
        .order("updated_at", { ascending: false })
        .limit(limit * 2); // Fetch extra to filter

      if (error) throw error;

      // Filter to stories that are complete and not yet analyzed
      const completeStories = (stories || []).filter(s => 
        s.total_clips && s.completed_clips && s.completed_clips >= s.total_clips
      );

      // Check which ones already have analysis
      const storyIds = completeStories.map(s => s.id);
      if (storyIds.length > 0) {
        const { data: existingAnalyses } = await supabase
          .from("story_analysis")
          .select("story_job_id")
          .in("story_job_id", storyIds);

        const analyzedIds = new Set((existingAnalyses || []).map(a => a.story_job_id));
        storiesToAnalyze = completeStories
          .filter(s => !analyzedIds.has(s.id))
          .slice(0, limit)
          .map(s => ({ id: s.id, title: s.title || "Untitled" }));
      }
    }

    if (storiesToAnalyze.length === 0) {
      console.log(`[auto-rate-story][${requestId}] No stories to analyze`);
      return new Response(JSON.stringify({ analyzed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[auto-rate-story][${requestId}] Analyzing ${storiesToAnalyze.length} stories`);

    const results: Array<{ story_id: string; success: boolean; error?: string }> = [];

    for (const story of storiesToAnalyze) {
      try {
        // Fetch clips for this story
        const { data: clips, error: clipsError } = await supabase
          .from("video_jobs")
          .select("id, sequence_index, original_prompt, thumbnail_url, spritesheet_url, provider, status")
          .eq("story_job_id", story.id)
          .eq("status", "done")
          .order("sequence_index", { ascending: true });

        if (clipsError) throw clipsError;

        if (!clips || clips.length < 2) {
          console.log(`[auto-rate-story][${requestId}] Story ${story.id} has <2 done clips, skipping`);
          results.push({ story_id: story.id, success: false, error: "Insufficient clips" });
          continue;
        }

        // Deduplicate clips per sequence_index (keep first with spritesheet, then thumbnail)
        const clipsByIndex = new Map<number, typeof clips[0]>();
        for (const clip of clips) {
          const idx = clip.sequence_index ?? -1;
          if (idx < 0) continue;
          const existing = clipsByIndex.get(idx);
          if (!existing) {
            clipsByIndex.set(idx, clip);
          } else if (!existing.spritesheet_url && clip.spritesheet_url) {
            clipsByIndex.set(idx, clip);
          }
        }

        const dedupedClips = Array.from(clipsByIndex.values())
          .sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0));

        // Check we have enough visual assets
        const withVisuals = dedupedClips.filter(c => c.thumbnail_url || c.spritesheet_url);
        if (withVisuals.length < 2) {
          console.log(`[auto-rate-story][${requestId}] Story ${story.id} has <2 clips with visuals, skipping`);
          results.push({ story_id: story.id, success: false, error: "Insufficient visual assets" });
          continue;
        }

        // Build scene data
        const scenes: SceneData[] = withVisuals.map(clip => ({
          index: clip.sequence_index ?? 0,
          prompt: clip.original_prompt || "",
          thumbnail_url: clip.thumbnail_url,
          spritesheet_url: clip.spritesheet_url,
          provider: clip.provider,
          status: clip.status,
          video_job_id: clip.id,
        }));

        console.log(`[auto-rate-story][${requestId}] Analyzing story ${story.id} with ${scenes.length} scenes`);

        // Run VLM analysis
        const analysis = await analyzeStoryWithVLM(scenes, story.title, openaiKey);

        // Categorize failures and generate recommendations
        const categorizedPatterns = categorizeFailures(analysis.failure_patterns);
        const recommendations = generateRecommendations(categorizedPatterns);

        // Insert story analysis
        const { error: insertError } = await supabase
          .from("story_analysis")
          .upsert({
            story_job_id: story.id,
            overall_flow_score: analysis.overall_flow_score,
            character_continuity: analysis.character_continuity,
            environment_consistency: analysis.environment_consistency,
            motion_logic: analysis.motion_logic,
            prompt_execution: analysis.prompt_execution,
            weak_scenes: analysis.weak_scenes,
            failure_patterns: categorizedPatterns,
            recommendations: recommendations.length > 0 ? recommendations : analysis.failure_patterns.length > 0 
              ? ["Review weak scenes and simplify prompts"]
              : ["Story shows good continuity - consider as reference"],
            analyzed_at: new Date().toISOString(),
            analyzer_version: ANALYZER_VERSION,
            raw: analysis as unknown as Record<string, unknown>,
          }, { onConflict: "story_job_id" });

        if (insertError) {
          console.error(`[auto-rate-story][${requestId}] Insert error:`, insertError);
          throw insertError;
        }

        // Write back continuity scores to individual clips
        for (const sceneScore of analysis.scene_scores) {
          const matchingScene = scenes.find(s => s.index === sceneScore.index);
          if (matchingScene) {
            await supabase
              .from("video_jobs")
              .update({
                continuity_score: sceneScore.continuity_score,
                continuity_notes: sceneScore.continuity_notes,
              })
              .eq("id", matchingScene.video_job_id);
          }
        }

        // Update story continuity_score
        await supabase
          .from("story_jobs")
          .update({ continuity_score: analysis.overall_flow_score })
          .eq("id", story.id);

        console.log(`[auto-rate-story][${requestId}] Story ${story.id} analyzed: flow=${analysis.overall_flow_score}`);
        results.push({ story_id: story.id, success: true });

      } catch (storyError) {
        const errorMsg = storyError instanceof Error ? storyError.message : String(storyError);
        console.error(`[auto-rate-story][${requestId}] Error analyzing story ${story.id}:`, errorMsg);
        results.push({ story_id: story.id, success: false, error: errorMsg });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`[auto-rate-story][${requestId}] Complete: ${successCount}/${results.length} stories analyzed`);

    return new Response(JSON.stringify({ 
      analyzed: successCount,
      total: results.length,
      results 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[auto-rate-story][${requestId}] Fatal error:`, errorMsg);
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
