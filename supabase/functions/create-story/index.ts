/**
 * create-story
 * 
 * Creates a new story_job entry and optionally triggers generation.
 * Now injects trend enrichment into scene prompts before creation.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { fetchTrendEnrichment } from "../_shared/trend-enrichment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CreateStoryRequest {
  title: string;
  account_id?: string;
  story_type?: string;
  continuity_anchors: Record<string, unknown>;
  storyboard_json: {
    scenes: Array<{
      id: string;
      prompt: string;
      sequence_index: number;
      duration_target: number;
      camera_direction?: string;
    }>;
  };
  auto_generate?: boolean;
  settings?: {
    size?: string;
    provider?: string;
  };
  experiment_ids?: {
    topic?: string;
    script?: string;
    hook?: string;
    visual?: string;
  };
  // Optional: caller can pass content_idea_id to link back
  content_idea_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: CreateStoryRequest = await req.json();
    const {
      title,
      account_id = "lab_sandbox",
      story_type = "short_story",
      continuity_anchors,
      storyboard_json,
      auto_generate = false,
      settings,
      experiment_ids,
      content_idea_id,
    } = body;

    if (!title || !continuity_anchors || !storyboard_json?.scenes?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "title, continuity_anchors, and storyboard_json.scenes required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Trend enrichment injection ──
    // Fetch trend context and enrich scene prompts with trending signals
    const enrichment = await fetchTrendEnrichment(supabase, {
      vertical: undefined, // will use whatever insights are available
      topic_prompt: title,
      mode: "light",
    });

    let enrichedStoryboard = storyboard_json;
    if (enrichment.enabled && enrichment.prompt_block) {
      // Inject trend context into the first scene's prompt as grounding
      const enrichedScenes = storyboard_json.scenes.map((scene, idx) => {
        if (idx === 0) {
          return {
            ...scene,
            prompt: `${scene.prompt}\n\n${enrichment.prompt_block}`,
          };
        }
        return scene;
      });
      enrichedStoryboard = { scenes: enrichedScenes };
      console.log(`[create-story] Enriched with ${enrichment.insight_ids.length} trend insights`);
    }

    // Create the story job
    const { data: storyJob, error: insertError } = await supabase
      .from("story_jobs")
      .insert({
        account_id,
        story_type,
        title,
        status: auto_generate ? "generating" : "draft",
        total_clips: enrichedStoryboard.scenes.length,
        completed_clips: 0,
        continuity_anchors: {
          ...continuity_anchors,
          // Store trend enrichment metadata for traceability
          ...(enrichment.enabled ? {
            _trend_enrichment: {
              insight_ids: enrichment.insight_ids,
              hook_patterns: enrichment.hook_patterns,
              mode: enrichment.mode,
            },
          } : {}),
        },
        storyboard_json: enrichedStoryboard,
        ...(experiment_ids?.topic ? { topic_experiment_id: experiment_ids.topic } : {}),
        ...(experiment_ids?.script ? { script_experiment_id: experiment_ids.script } : {}),
        ...(experiment_ids?.hook ? { hook_experiment_id: experiment_ids.hook } : {}),
        ...(experiment_ids?.visual ? { visual_experiment_id: experiment_ids.visual } : {}),
      })
      .select()
      .single();

    if (insertError || !storyJob) {
      console.error("[create-story] Insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: `Failed to create story: ${insertError?.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Link content idea to this story if provided
    if (content_idea_id) {
      await supabase
        .from("content_ideas")
        .update({ story_job_id: storyJob.id, status: "produced" })
        .eq("id", content_idea_id);
    }

    console.log(`[create-story] Created story ${storyJob.id}: "${title}" with ${enrichedStoryboard.scenes.length} scenes (trend_enriched=${enrichment.enabled})`);

    // If auto_generate, trigger the chained generation
    if (auto_generate) {
      const chainedPayload = {
        story_job_id: storyJob.id,
        scenes: enrichedStoryboard.scenes,
        anchors: continuity_anchors,
        settings: settings || { size: "720x1280", provider: "runway" },
      };

      fetch(`${supabaseUrl}/functions/v1/generate-story-chained`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${supabaseServiceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(chainedPayload),
      }).catch(err => {
        console.error("[create-story] Failed to trigger generation:", err);
      });

      console.log(`[create-story] Triggered chained generation for story ${storyJob.id}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        story_job_id: storyJob.id,
        title: storyJob.title,
        scene_count: enrichedStoryboard.scenes.length,
        status: storyJob.status,
        auto_generate_triggered: auto_generate,
        trend_enriched: enrichment.enabled,
        trend_insight_count: enrichment.insight_ids.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[create-story] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
