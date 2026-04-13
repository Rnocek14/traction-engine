/**
 * Prompt Experiment Logger
 * 
 * Shared helper for edge functions to create prompt_experiments and prompt_scores
 * records automatically during generation pipelines.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ExperimentStage = "topic" | "script" | "hook" | "visual";

export interface LogExperimentInput {
  stage: ExperimentStage;
  family: string;
  promptText: string;
  promptVariables?: Record<string, unknown>;
  inputContext?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  templateId?: string;
  vertical?: string;
  platform?: string;
  provider?: string;
  model?: string;
  accountId?: string;
  storyJobId?: string;
  scriptRunId?: string;
  parentExperimentId?: string;
  generationRound?: number;
  status?: string;
}

export interface PreflightScoreInput {
  experimentId: string;
  overallScore?: number;
  novelty?: number;
  clarity?: number;
  specificity?: number;
  hookStrength?: number;
  visuality?: number;
  coherence?: number;
  confidence?: number;
  riskScore?: number;
  hardFail?: boolean;
  notes?: string;
  scorePayload?: Record<string, unknown>;
}

function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

/**
 * Create a prompt_experiments record. Returns the experiment ID or null on failure.
 * Fire-and-forget safe — errors are logged but never thrown.
 */
export async function logExperiment(
  input: LogExperimentInput,
  supabase?: SupabaseClient,
): Promise<string | null> {
  try {
    const client = supabase || getServiceClient();

    const { data, error } = await client
      .from("prompt_experiments")
      .insert({
        stage: input.stage,
        family: input.family,
        prompt_text: input.promptText,
        prompt_variables: input.promptVariables || {},
        input_context: input.inputContext || {},
        output_summary: input.outputSummary || {},
        template_id: input.templateId || null,
        vertical: input.vertical || null,
        platform: input.platform || null,
        provider: input.provider || null,
        model: input.model || null,
        account_id: input.accountId || null,
        story_job_id: input.storyJobId || null,
        script_run_id: input.scriptRunId || null,
        parent_experiment_id: input.parentExperimentId || null,
        generation_round: input.generationRound || 1,
        status: input.status || "generated",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[prompt-experiment-logger] Insert error:", error.message);
      return null;
    }

    console.log(`[prompt-experiment-logger] Created experiment ${data.id} stage=${input.stage} family=${input.family}`);
    return data.id;
  } catch (err) {
    console.error("[prompt-experiment-logger] Unexpected error:", err);
    return null;
  }
}

/**
 * Write a prompt_scores record (preflight or output layer).
 * Fire-and-forget safe.
 */
export async function logScore(
  input: PreflightScoreInput,
  layer: "preflight" | "output" = "output",
  supabase?: SupabaseClient,
): Promise<void> {
  try {
    const client = supabase || getServiceClient();

    const { error } = await client
      .from("prompt_scores")
      .insert({
        experiment_id: input.experimentId,
        score_layer: layer,
        overall_score: input.overallScore ?? null,
        novelty: input.novelty ?? null,
        clarity: input.clarity ?? null,
        specificity: input.specificity ?? null,
        hook_strength: input.hookStrength ?? null,
        visuality: input.visuality ?? null,
        coherence: input.coherence ?? null,
        confidence: input.confidence ?? null,
        risk_score: input.riskScore ?? null,
        hard_fail: input.hardFail ?? false,
        notes: input.notes ?? null,
        score_payload: input.scorePayload || {},
        scored_by: "system",
      });

    if (error) {
      console.error("[prompt-experiment-logger] Score insert error:", error.message);
    }
  } catch (err) {
    console.error("[prompt-experiment-logger] Score unexpected error:", err);
  }
}

/**
 * Link experiment IDs back to a story_job row.
 * Fire-and-forget safe.
 */
export async function linkExperimentsToStory(
  storyJobId: string,
  experimentIds: {
    topic?: string;
    script?: string;
    hook?: string;
    visual?: string;
  },
  supabase?: SupabaseClient,
): Promise<void> {
  try {
    const client = supabase || getServiceClient();

    const updates: Record<string, string | null> = {};
    if (experimentIds.topic) updates.topic_experiment_id = experimentIds.topic;
    if (experimentIds.script) updates.script_experiment_id = experimentIds.script;
    if (experimentIds.hook) updates.hook_experiment_id = experimentIds.hook;
    if (experimentIds.visual) updates.visual_experiment_id = experimentIds.visual;

    if (Object.keys(updates).length === 0) return;

    const { error } = await client
      .from("story_jobs")
      .update(updates)
      .eq("id", storyJobId);

    if (error) {
      console.error("[prompt-experiment-logger] Link error:", error.message);
    } else {
      console.log(`[prompt-experiment-logger] Linked experiments to story ${storyJobId}:`, Object.keys(updates));
    }
  } catch (err) {
    console.error("[prompt-experiment-logger] Link unexpected error:", err);
  }
}
