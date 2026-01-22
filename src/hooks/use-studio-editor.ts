import { useState, useCallback, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables } from "@/integrations/supabase/types";

type ScriptRun = Tables<"script_runs">;

export interface ScriptEdits {
  hook: string;
  voiceover: string;
  cta: string;
  hashtags: string[];
  scene_prompts: string[];
}

interface UseStudioEditorOptions {
  script: ScriptRun;
}

/**
 * Centralized hook for managing script edits with dirty state tracking.
 * Handles inline editing, scene reordering, and persistence.
 */
export function useStudioEditor({ script }: UseStudioEditorOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Parse original content
  const originalContent = useMemo(() => {
    const content = script.script_content as Record<string, unknown> | null;
    return {
      hook: (content?.hook as string) || "",
      voiceover: (content?.voiceover as string) || "",
      cta: (content?.cta as string) || "",
      hashtags: (content?.hashtags as string[]) || [],
      scene_prompts: (content?.scene_prompts as string[]) || [],
    };
  }, [script.script_content]);

  // Local editable state
  const [edits, setEdits] = useState<ScriptEdits>(originalContent);

  // Reset edits when script changes
  useEffect(() => {
    setEdits(originalContent);
  }, [originalContent]);

  // Check if there are unsaved changes
  const isDirty = useMemo(() => {
    return (
      edits.hook !== originalContent.hook ||
      edits.voiceover !== originalContent.voiceover ||
      edits.cta !== originalContent.cta ||
      JSON.stringify(edits.hashtags) !== JSON.stringify(originalContent.hashtags) ||
      JSON.stringify(edits.scene_prompts) !== JSON.stringify(originalContent.scene_prompts)
    );
  }, [edits, originalContent]);

  // Track which fields are dirty
  const dirtyFields = useMemo(() => ({
    hook: edits.hook !== originalContent.hook,
    voiceover: edits.voiceover !== originalContent.voiceover,
    cta: edits.cta !== originalContent.cta,
    hashtags: JSON.stringify(edits.hashtags) !== JSON.stringify(originalContent.hashtags),
    scene_prompts: JSON.stringify(edits.scene_prompts) !== JSON.stringify(originalContent.scene_prompts),
  }), [edits, originalContent]);

  // Update individual fields
  const updateField = useCallback(<K extends keyof ScriptEdits>(
    field: K,
    value: ScriptEdits[K]
  ) => {
    setEdits((prev) => ({ ...prev, [field]: value }));
  }, []);

  // Reorder scenes
  const reorderScenes = useCallback((fromIndex: number, toIndex: number) => {
    setEdits((prev) => {
      const newScenes = [...prev.scene_prompts];
      const [removed] = newScenes.splice(fromIndex, 1);
      newScenes.splice(toIndex, 0, removed);
      return { ...prev, scene_prompts: newScenes };
    });
  }, []);

  // Reset to original
  const resetEdits = useCallback(() => {
    setEdits(originalContent);
  }, [originalContent]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const content = script.script_content as Record<string, unknown>;
      const updatedContent = {
        ...content,
        hook: edits.hook,
        voiceover: edits.voiceover,
        cta: edits.cta,
        hashtags: edits.hashtags,
        scene_prompts: edits.scene_prompts,
      };

      // Determine if we need to reset QA status
      // Text changes invalidate QA, scene reorder doesn't
      const textChanged = 
        edits.hook !== originalContent.hook ||
        edits.voiceover !== originalContent.voiceover ||
        edits.cta !== originalContent.cta;

      const updatePayload: Record<string, unknown> = {
        script_content: updatedContent,
        draft_edits: {
          edited_at: new Date().toISOString(),
          fields_changed: Object.entries(dirtyFields)
            .filter(([_, dirty]) => dirty)
            .map(([field]) => field),
        },
      };

      // If text was changed and script was QA passed, mark as needing review
      if (textChanged && script.status === "qa_passed") {
        updatePayload.status = "draft";
        updatePayload.qa_passed_at = null;
      }

      const { error } = await supabase
        .from("script_runs")
        .update(updatePayload)
        .eq("id", script.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Changes saved" });
      queryClient.invalidateQueries({ queryKey: ["script-run", script.id] });
    },
    onError: (error) => {
      toast({
        title: "Failed to save",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Keyboard save handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !saveMutation.isPending) {
          saveMutation.mutate();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, saveMutation]);

  return {
    edits,
    originalContent,
    isDirty,
    dirtyFields,
    updateField,
    reorderScenes,
    resetEdits,
    save: () => saveMutation.mutate(),
    isSaving: saveMutation.isPending,
  };
}
