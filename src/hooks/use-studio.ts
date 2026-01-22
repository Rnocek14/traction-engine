import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, Enums } from "@/integrations/supabase/types";

export type ScriptRun = Tables<"script_runs">;

/**
 * Fetches a single script run by ID with full content
 */
export function useScriptRunDetail(scriptId: string | undefined) {
  return useQuery({
    queryKey: ["script-run", scriptId],
    queryFn: async (): Promise<ScriptRun | null> => {
      if (!scriptId) return null;

      const { data, error } = await supabase
        .from("script_runs")
        .select("*")
        .eq("id", scriptId)
        .single();

      if (error) {
        console.error("Error fetching script run:", error);
        throw error;
      }

      return data;
    },
    enabled: !!scriptId,
  });
}

/**
 * Fetches the full version chain for a script by traversing regenerated_from_id
 * Returns array ordered from oldest (original) to newest
 */
export function useScriptVersionChain(scriptId: string | undefined) {
  return useQuery({
    queryKey: ["script-version-chain", scriptId],
    queryFn: async (): Promise<ScriptRun[]> => {
      if (!scriptId) return [];

      // First, get the current script
      const { data: currentScript, error: currentError } = await supabase
        .from("script_runs")
        .select("*")
        .eq("id", scriptId)
        .single();

      if (currentError || !currentScript) {
        console.error("Error fetching current script:", currentError);
        return [];
      }

      const chain: ScriptRun[] = [currentScript];

      // Traverse backwards to find ancestors (original scripts)
      let ancestorId = currentScript.regenerated_from_id;
      while (ancestorId) {
        const { data: ancestor, error: ancestorError } = await supabase
          .from("script_runs")
          .select("*")
          .eq("id", ancestorId)
          .single();

        if (ancestorError || !ancestor) break;

        chain.unshift(ancestor); // Add to beginning
        ancestorId = ancestor.regenerated_from_id;
      }

      // Traverse forwards to find descendants (regenerations)
      const findDescendants = async (parentId: string): Promise<ScriptRun[]> => {
        const { data: children, error: childError } = await supabase
          .from("script_runs")
          .select("*")
          .eq("regenerated_from_id", parentId)
          .order("created_at", { ascending: true });

        if (childError || !children || children.length === 0) return [];

        const allDescendants: ScriptRun[] = [];
        for (const child of children) {
          // Skip if already in chain (the current script)
          if (!chain.some((s) => s.id === child.id)) {
            allDescendants.push(child);
            const grandChildren = await findDescendants(child.id);
            allDescendants.push(...grandChildren);
          }
        }
        return allDescendants;
      };

      // Find all descendants from the ROOT (oldest ancestor), not the current script
      // This ensures we get the full tree even when viewing a mid-chain node
      const rootId = chain[0].id;
      const descendants = await findDescendants(rootId);
      chain.push(...descendants);

      // Sort by created_at to ensure proper order
      chain.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      return chain;
    },
    enabled: !!scriptId,
  });
}

/**
 * Gets account config for a script's account_id
 */
export function useAccountConfigForScript(accountId: string | undefined) {
  return useQuery({
    queryKey: ["account-config", accountId],
    queryFn: async () => {
      if (!accountId) return null;

      const { data, error } = await supabase
        .from("account_configs")
        .select("*")
        .eq("account_id", accountId)
        .single();

      if (error) {
        console.error("Error fetching account config:", error);
        return null;
      }

      return data;
    },
    enabled: !!accountId,
  });
}

/**
 * Helper to determine if a script has hard blocks
 */
export function hasHardBlocks(script: ScriptRun): boolean {
  const flags = script.hard_block_flags;
  return Array.isArray(flags) && flags.length > 0;
}

/**
 * Helper to get status display info
 */
export function getStatusInfo(script: ScriptRun): {
  label: string;
  variant: "default" | "destructive" | "success" | "warning";
  description: string;
} {
  const status = script.status as Enums<"script_status">;
  
  if (hasHardBlocks(script)) {
    return {
      label: "Hard Block",
      variant: "destructive",
      description: "Cannot be overridden - requires regeneration",
    };
  }

  switch (status) {
    case "qa_passed":
      return {
        label: "QA Passed",
        variant: "success",
        description: "Ready for video generation",
      };
    case "qa_failed":
      return {
        label: "QA Failed",
        variant: "warning",
        description: "Needs review or override",
      };
    case "draft":
      return {
        label: "Draft",
        variant: "default",
        description: "Work in progress",
      };
    case "generating":
      return {
        label: "Generating",
        variant: "default",
        description: "AI generation in progress",
      };
    case "published":
      return {
        label: "Published",
        variant: "success",
        description: "Live content",
      };
    case "rejected":
      return {
        label: "Rejected",
        variant: "destructive",
        description: "Permanently rejected",
      };
    default:
      return {
        label: status,
        variant: "default",
        description: "",
      };
  }
}
