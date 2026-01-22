// ============================================
// OpenAI Script Generation Client
// ============================================
import { supabase } from "@/integrations/supabase/client";
import type { ScriptContent, AccountConfig, Topic } from "@/types/script-types";

interface GenerateScriptResponse {
  success: boolean;
  script_content?: ScriptContent;
  generation_cost_cents?: number;
  error?: string;
}

export async function generateScriptWithAI(
  accountConfig: AccountConfig,
  topic: Topic
): Promise<GenerateScriptResponse> {
  try {
    const { data, error } = await supabase.functions.invoke<GenerateScriptResponse>(
      "generate-script",
      {
        body: {
          account_config: {
            account_id: accountConfig.account_id,
            vertical: accountConfig.vertical,
            persona: accountConfig.persona,
            audience: accountConfig.audience,
            promise: accountConfig.promise,
            content_pillars: accountConfig.content_pillars,
            banned_topics: accountConfig.banned_topics,
            claim_policy: accountConfig.claim_policy,
            cta_style: accountConfig.cta_style,
            cta_phrases: accountConfig.cta_phrases,
            style_rules: accountConfig.style_rules,
            disclaimer_rules: accountConfig.disclaimer_rules,
          },
          topic: {
            id: topic.id,
            topic_prompt: topic.topic_prompt,
            hook_variants: topic.hook_variants,
            pillar: topic.pillar,
            motif_hints: topic.motif_hints,
            suggested_cta: topic.suggested_cta,
          },
        },
      }
    );

    if (error) {
      console.error("Edge function error:", error);
      return {
        success: false,
        error: error.message || "Failed to call generate-script function",
      };
    }

    if (!data) {
      return {
        success: false,
        error: "No data returned from edge function",
      };
    }

    return data;
  } catch (err) {
    console.error("Error calling generate-script:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
