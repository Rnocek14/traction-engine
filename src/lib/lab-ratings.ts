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
  accuracy_rating: number | null;
  accuracy_notes: string | null;
  output_url: string | null;
  status: string;
}

export async function getVideoJobDetails(jobId: string): Promise<VideoJobDetails | null> {
  const { data, error } = await supabase
    .from("video_jobs")
    .select("id, provider, original_prompt, enriched_prompt, style_hints, accuracy_rating, accuracy_notes, output_url, status")
    .eq("id", jobId)
    .single();

  if (error) {
    console.error("Failed to fetch video job details:", error);
    return null;
  }

  return data as VideoJobDetails;
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
