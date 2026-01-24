/**
 * Lab rating utilities for fetching video job details
 */

import { supabase } from "@/integrations/supabase/client";

export interface VideoJobDetails {
  id: string;
  provider: string;
  original_prompt: string | null;
  enriched_prompt: string | null;
  style_hints: string | null;
  accuracy_rating: number | null; // Legacy, kept for backwards compat
  accuracy_notes: string | null;
  output_url: string | null;
  status: string;
  // Auto-rating fields
  auto_match_score: number | null;
  auto_quality_score: number | null;
  auto_overall_score: number | null;
  auto_confidence: number | null;
  auto_rated_at: string | null;
  auto_reasons: string[] | null;
  human_rating_override: boolean | null;
  // Dual-axis human ratings
  human_match_rating: number | null;
  human_preference_rating: number | null;
  is_serendipity: boolean | null;
}

export async function getVideoJobDetails(jobId: string): Promise<VideoJobDetails | null> {
  const { data, error } = await supabase
    .from("video_jobs")
    .select(`
      id, provider, original_prompt, enriched_prompt, style_hints, 
      accuracy_rating, accuracy_notes, output_url, status,
      auto_match_score, auto_quality_score, auto_overall_score, 
      auto_confidence, auto_rated_at, auto_reasons, human_rating_override,
      human_match_rating, human_preference_rating, is_serendipity
    `)
    .eq("id", jobId)
    .single();

  if (error) {
    console.error("Failed to fetch video job details:", error);
    return null;
  }

  return data as VideoJobDetails;
}

/**
 * Trigger auto-rating for a video job
 */
export async function triggerAutoRating(jobId: string): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke("auto-rate-video", {
    body: { jobId },
  });

  if (error) {
    console.error("Auto-rating failed:", error);
    return { success: false, error: error.message };
  }

  return { success: true, ...data };
}

export async function getPromptLearnings(provider?: string) {
  let query = supabase
    .from("prompt_learnings")
    .select("*")
    .order("average_rating", { ascending: false })
    .limit(50);

  if (provider) {
    query = query.eq("provider", provider);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch prompt learnings:", error);
    return [];
  }

  return data;
}
