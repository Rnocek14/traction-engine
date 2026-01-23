import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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

interface HistoryState {
  past: ScriptEdits[];
  present: ScriptEdits;
  future: ScriptEdits[];
}

interface UseStudioEditorOptions {
  script: ScriptRun;
  historyLimit?: number;
  debounceMs?: number;
}

/**
 * Centralized hook for managing script edits with dirty state tracking,
 * undo/redo history, and persistence.
 */
export function useStudioEditor({
  script,
  historyLimit = 50,
  debounceMs = 500,
}: UseStudioEditorOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshotRef = useRef<string>("");

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

  // History state
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: originalContent,
    future: [],
  });

  // Reset history when script changes
  useEffect(() => {
    setHistory({
      past: [],
      present: originalContent,
      future: [],
    });
    lastSnapshotRef.current = JSON.stringify(originalContent);
  }, [originalContent]);

  const edits = history.present;

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

  // Push to history (for immediate changes like reorder)
  const pushToHistory = useCallback((newPresent: ScriptEdits) => {
    setHistory((prev) => {
      // Don't push if nothing changed
      if (JSON.stringify(prev.present) === JSON.stringify(newPresent)) {
        return prev;
      }

      const newPast = [...prev.past, prev.present].slice(-historyLimit);
      return {
        past: newPast,
        present: newPresent,
        future: [], // Clear future on new action
      };
    });
    lastSnapshotRef.current = JSON.stringify(newPresent);
  }, [historyLimit]);

  // Debounced snapshot for typing
  const scheduleSnapshot = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setHistory((prev) => {
        const currentSnapshot = JSON.stringify(prev.present);
        if (currentSnapshot === lastSnapshotRef.current) {
          return prev;
        }

        lastSnapshotRef.current = currentSnapshot;
        const newPast = [...prev.past, prev.present].slice(-historyLimit);
        
        // Actually we want to update past with the snapshot BEFORE current edits
        // This is already happening via the last committed present
        return prev;
      });
    }, debounceMs);
  }, [debounceMs, historyLimit]);

  // Update without pushing to history (for live typing)
  const updateWithoutHistory = useCallback((newPresent: ScriptEdits) => {
    setHistory((prev) => ({
      ...prev,
      present: newPresent,
      future: [], // Clear future on any edit
    }));
  }, []);

  // Update individual fields (debounced history for typing)
  const updateField = useCallback(<K extends keyof ScriptEdits>(
    field: K,
    value: ScriptEdits[K]
  ) => {
    setHistory((prev) => {
      const newPresent = { ...prev.present, [field]: value };
      const currentSnapshot = JSON.stringify(prev.present);
      
      // If this is the first change since last snapshot, save it first
      if (currentSnapshot !== lastSnapshotRef.current && prev.past.length === 0) {
        // Initial snapshot before any edits
        return {
          past: [prev.present],
          present: newPresent,
          future: [],
        };
      }

      // Check if we should push a snapshot (debounced)
      if (currentSnapshot !== lastSnapshotRef.current) {
        // Time-based snapshotting handled separately
      }

      return {
        ...prev,
        present: newPresent,
        future: [],
      };
    });

    // Schedule a snapshot after typing stops
    scheduleSnapshot();
  }, [scheduleSnapshot]);

  // Commit current state to history (e.g., on blur or explicit action)
  const commitToHistory = useCallback(() => {
    setHistory((prev) => {
      const currentSnapshot = JSON.stringify(prev.present);
      if (currentSnapshot === lastSnapshotRef.current) {
        return prev;
      }

      lastSnapshotRef.current = currentSnapshot;
      const lastPast = prev.past[prev.past.length - 1];
      
      // Don't push if same as last history entry
      if (lastPast && JSON.stringify(lastPast) === currentSnapshot) {
        return prev;
      }

      return {
        past: [...prev.past, prev.present].slice(-historyLimit),
        present: prev.present,
        future: [],
      };
    });
  }, [historyLimit]);

  // Reorder scenes (immediate history push)
  const reorderScenes = useCallback((fromIndex: number, toIndex: number) => {
    setHistory((prev) => {
      const newScenes = [...prev.present.scene_prompts];
      const [removed] = newScenes.splice(fromIndex, 1);
      newScenes.splice(toIndex, 0, removed);
      
      const newPresent = { ...prev.present, scene_prompts: newScenes };
      const newPast = [...prev.past, prev.present].slice(-historyLimit);
      
      lastSnapshotRef.current = JSON.stringify(newPresent);
      
      return {
        past: newPast,
        present: newPresent,
        future: [],
      };
    });
  }, [historyLimit]);

  // Undo
  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;

      const newPast = [...prev.past];
      const previousState = newPast.pop()!;
      
      lastSnapshotRef.current = JSON.stringify(previousState);

      return {
        past: newPast,
        present: previousState,
        future: [prev.present, ...prev.future].slice(0, historyLimit),
      };
    });
  }, [historyLimit]);

  // Redo
  const redo = useCallback(() => {
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;

      const newFuture = [...prev.future];
      const nextState = newFuture.shift()!;
      
      lastSnapshotRef.current = JSON.stringify(nextState);

      return {
        past: [...prev.past, prev.present].slice(-historyLimit),
        present: nextState,
        future: newFuture,
      };
    });
  }, [historyLimit]);

  // Reset to original
  const resetEdits = useCallback(() => {
    pushToHistory(originalContent);
    setHistory((prev) => ({
      ...prev,
      present: originalContent,
    }));
  }, [originalContent, pushToHistory]);

  // Can undo/redo
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

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

  // Keyboard shortcuts for save, undo, redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if in input/textarea (unless it's a global shortcut)
      const isTextInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      
      // Save: Cmd/Ctrl+S (works everywhere)
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (isDirty && !saveMutation.isPending) {
          saveMutation.mutate();
        }
        return;
      }

      // Undo: Cmd/Ctrl+Z
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        // Allow native undo in text inputs if no history
        if (isTextInput && !canUndo) return;
        
        e.preventDefault();
        undo();
        return;
      }

      // Redo: Cmd/Ctrl+Shift+Z or Ctrl+Y
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") {
        if (isTextInput && !canRedo) return;
        
        e.preventDefault();
        redo();
        return;
      }

      if (e.ctrlKey && e.key === "y") {
        if (isTextInput && !canRedo) return;
        
        e.preventDefault();
        redo();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDirty, saveMutation, canUndo, canRedo, undo, redo]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

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
    // Undo/Redo
    undo,
    redo,
    canUndo,
    canRedo,
    historyLength: history.past.length,
    futureLength: history.future.length,
    commitToHistory,
  };
}
