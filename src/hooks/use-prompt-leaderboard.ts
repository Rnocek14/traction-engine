import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PromptTemplate {
  id: string;
  name: string;
  stage: string;
  family: string;
  description: string | null;
  template_text: string;
  is_active: boolean;
  version: number;
  verticals: string[];
  platforms: string[];
  created_at: string;
}

export interface PromptExperimentRow {
  id: string;
  template_id: string | null;
  stage: string;
  family: string;
  vertical: string | null;
  provider: string | null;
  status: string;
  prompt_text: string;
  created_at: string;
  story_job_id: string | null;
}

export interface PromptFamilyStat {
  id: string;
  stage: string;
  family: string;
  vertical: string | null;
  platform: string | null;
  provider: string | null;
  sample_size: number;
  avg_preflight_score: number | null;
  avg_output_score: number | null;
  avg_human_score: number | null;
  avg_performance_score: number | null;
  approval_rate: number | null;
  rejection_rate: number | null;
  hard_fail_rate: number | null;
  fatigue_score: number | null;
  promoted: boolean;
  retired: boolean;
  last_used_at: string | null;
}

export function usePromptTemplates(stage?: string) {
  return useQuery({
    queryKey: ["prompt-templates", stage],
    queryFn: async () => {
      let query = supabase
        .from("prompt_templates")
        .select("*")
        .eq("is_active", true)
        .order("stage")
        .order("family");

      if (stage) {
        query = query.eq("stage", stage);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PromptTemplate[];
    },
  });
}

export function usePromptFamilyStats() {
  return useQuery({
    queryKey: ["prompt-family-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("prompt_family_stats")
        .select("*")
        .order("sample_size", { ascending: false });

      if (error) throw error;
      return (data || []) as PromptFamilyStat[];
    },
    refetchInterval: 30000,
  });
}

export function usePromptExperiments(filters?: { stage?: string; family?: string; limit?: number }) {
  return useQuery({
    queryKey: ["prompt-experiments", filters],
    queryFn: async () => {
      let query = supabase
        .from("prompt_experiments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(filters?.limit || 50);

      if (filters?.stage) query = query.eq("stage", filters.stage);
      if (filters?.family) query = query.eq("family", filters.family);

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PromptExperimentRow[];
    },
    refetchInterval: 30000,
  });
}
