/**
 * create-story
 * 
 * Creates a new story_job entry and optionally triggers generation.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  // Prompt R&D lineage
  experiment_ids?: {
    topic?: string;
    script?: string;
    hook?: string;
    visual?: string;
  };
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
    } = body;

    if (!title || !continuity_anchors || !storyboard_json?.scenes?.length) {
      return new Response(
        JSON.stringify({ success: false, error: "title, continuity_anchors, and storyboard_json.scenes required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create the story job
    const { data: storyJob, error: insertError } = await supabase
      .from("story_jobs")
      .insert({
        account_id,
        story_type,
        title,
        status: auto_generate ? "generating" : "draft",
        total_clips: storyboard_json.scenes.length,
        completed_clips: 0,
        continuity_anchors,
        storyboard_json,
        // Prompt R&D lineage
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

    console.log(`[create-story] Created story ${storyJob.id}: "${title}" with ${storyboard_json.scenes.length} scenes`);

    // If auto_generate, trigger the chained generation
    if (auto_generate) {
      const chainedPayload = {
        story_job_id: storyJob.id,
        scenes: storyboard_json.scenes,
        anchors: continuity_anchors,
        settings: settings || { size: "720x1280", provider: "runway" },
      };

      // Fire and forget - don't wait for completion
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
        scene_count: storyboard_json.scenes.length,
        status: storyJob.status,
        auto_generate_triggered: auto_generate,
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
