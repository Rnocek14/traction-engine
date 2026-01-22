import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

export type RegenPreset = 'keep_topic' | 'new_topic_same_pillar' | 'fix_flags' | 'template_keep_topic';

export interface RegenerateFromStudioParams {
  scriptId: string;
  preset: RegenPreset;
  constraint?: string;
}

export interface RegenerateResult {
  success: boolean;
  script_run?: Tables<"script_runs">;
  original_script_id?: string;
  request_id: string;
  error?: string;
}

/**
 * Builds a constraint string from a script's failure state
 */
export function buildConstraintFromFailure(script: Tables<"script_runs">): string {
  const parts: string[] = [];
  
  if (script.qa_failed_reason) {
    parts.push(`Previous attempt failed: ${script.qa_failed_reason}`);
  }
  
  const safetyFlags = script.safety_flags || [];
  if (safetyFlags.length > 0) {
    parts.push(`AVOID these issues that were flagged: ${safetyFlags.join(', ')}`);
  }
  
  const hardBlockFlags = script.hard_block_flags || [];
  if (hardBlockFlags.length > 0) {
    parts.push(`CRITICAL - You MUST fix these hard blocks: ${hardBlockFlags.join(', ')}`);
    
    // Add specific guidance based on common hard blocks
    for (const flag of hardBlockFlags) {
      if (flag.includes('EXERCISE_INSTRUCTION')) {
        parts.push('Do NOT include specific exercise instructions, reps, sets, or "try this stretch" type content');
      }
      if (flag.includes('TREATMENT_CLAIM') || flag.includes('MEDICAL_CLAIM')) {
        parts.push('Do NOT use words like cure, heal, treatment, diagnosis. Focus on emotional support and community.');
      }
    }
  }

  // Add vertical-specific reminders
  const content = script.script_content as Record<string, unknown> | null;
  if (content) {
    // We can add more contextual guidance here
  }

  return parts.join('\n\n');
}

/**
 * Hook for regenerating scripts from Studio with presets
 */
export function useRegenerateFromStudio() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ scriptId, preset, constraint }: RegenerateFromStudioParams): Promise<RegenerateResult> => {
      const mode = preset === 'template_keep_topic' ? 'template' : 'ai';

      const { data, error } = await supabase.functions.invoke('regenerate-script', {
        body: {
          script_id: scriptId,
          mode,
          regen_preset: preset,
          constraint,
        },
      });

      if (error) {
        throw new Error(error.message || 'Regeneration failed');
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Regeneration failed');
      }

      return data as RegenerateResult;
    },
    onSuccess: (data, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['script-version-chain', variables.scriptId] });
      if (data.script_run?.id) {
        queryClient.invalidateQueries({ queryKey: ['script-version-chain', data.script_run.id] });
        queryClient.invalidateQueries({ queryKey: ['script-run', data.script_run.id] });
      }
      queryClient.invalidateQueries({ queryKey: ['qa-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['qa-inbox-stats'] });
    },
  });
}
