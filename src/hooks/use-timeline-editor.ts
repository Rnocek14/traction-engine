import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Tables, Json } from "@/integrations/supabase/types";
import {
  Clip,
  TimelineData,
  generateClipId,
  scenePromptsToClips,
  splitClip,
  trimClip,
  rippleDeleteClip,
  deleteClip,
  moveClip,
  duplicateClip,
  calculateTimelineDuration,
  reflowClipsSequential,
} from "@/types/timeline-types";

type ScriptRun = Tables<"script_runs">;

interface HistoryState {
  past: Clip[][];
  present: Clip[];
  future: Clip[][];
}

interface UseTimelineEditorOptions {
  script: ScriptRun;
  defaultSceneDuration?: number;
  historyLimit?: number;
}

/**
 * Timeline editor hook with clip-based editing, undo/redo, and persistence.
 * Converts legacy scene_prompts to clips on first load.
 */
export function useTimelineEditor({
  script,
  defaultSceneDuration = 4,
  historyLimit = 50,
}: UseTimelineEditorOptions) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const lastSnapshotRef = useRef<string>("");

  // Fetch existing timeline or create from scene_prompts
  const { data: timelineRecord, isLoading: isLoadingTimeline } = useQuery({
    queryKey: ["studio-timeline", script.id],
    queryFn: async () => {
      // Try to fetch existing timeline
      const { data, error } = await supabase
        .from("studio_timelines")
        .select("*")
        .eq("script_run_id", script.id)
        .order("version", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") {
        throw error;
      }

      return data;
    },
  });

  // Initialize clips from timeline or scene_prompts
  const initialClips = useMemo(() => {
    if (timelineRecord?.timeline_json) {
      const data = timelineRecord.timeline_json as unknown as TimelineData;
      return data.clips || [];
    }

    // Convert legacy scene_prompts to clips
    const content = script.script_content as Record<string, unknown> | null;
    const scenePrompts = (content?.scene_prompts as string[]) || [];
    return scenePromptsToClips(scenePrompts, defaultSceneDuration);
  }, [timelineRecord, script.script_content, defaultSceneDuration]);

  // History state
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: initialClips,
    future: [],
  });

  // Reset when script/timeline changes
  useEffect(() => {
    setHistory({
      past: [],
      present: initialClips,
      future: [],
    });
    lastSnapshotRef.current = JSON.stringify(initialClips);
  }, [initialClips]);

  const clips = history.present;

  // Selection state - use lazy initializer to avoid recreating Set on every render
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(() => new Set());
  const [playheadPosition, setPlayheadPosition] = useState(0);
  const [rippleMode, setRippleMode] = useState(false);

  // Computed values
  const duration = useMemo(() => calculateTimelineDuration(clips), [clips]);
  const selectedClips = useMemo(
    () => clips.filter((c) => selectedClipIds.has(c.id)),
    [clips, selectedClipIds]
  );

  // Check if there are unsaved changes
  const isDirty = useMemo(() => {
    const original = JSON.stringify(initialClips);
    const current = JSON.stringify(clips);
    return original !== current;
  }, [clips, initialClips]);

  // Push to history
  const pushToHistory = useCallback(
    (newClips: Clip[]) => {
      setHistory((prev) => {
        if (JSON.stringify(prev.present) === JSON.stringify(newClips)) {
          return prev;
        }

        const newPast = [...prev.past, prev.present].slice(-historyLimit);
        lastSnapshotRef.current = JSON.stringify(newClips);

        return {
          past: newPast,
          present: newClips,
          future: [],
        };
      });
    },
    [historyLimit]
  );

  // Update clips without history (for live updates)
  const setClips = useCallback((newClips: Clip[]) => {
    setHistory((prev) => ({
      ...prev,
      present: newClips,
      future: [],
    }));
  }, []);

  // ========== Selection ==========

  const selectClip = useCallback((clipId: string, multi = false) => {
    setSelectedClipIds((prev) => {
      if (multi) {
        const next = new Set(prev);
        if (next.has(clipId)) {
          next.delete(clipId);
        } else {
          next.add(clipId);
        }
        return next;
      }
      return new Set([clipId]);
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedClipIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    setSelectedClipIds(new Set(clips.map((c) => c.id)));
  }, [clips]);

  // ========== Editing Operations ==========

  /** Split selected clip at playhead */
  const splitAtPlayhead = useCallback(() => {
    if (selectedClipIds.size !== 1) {
      toast({ title: "Select a single clip to split", variant: "destructive" });
      return;
    }

    const clipId = Array.from(selectedClipIds)[0];
    const idx = clips.findIndex((c) => c.id === clipId);
    if (idx === -1) return;

    const clip = clips[idx];
    const result = splitClip(clip, playheadPosition);
    if (!result) {
      toast({ title: "Playhead must be within clip to split", variant: "destructive" });
      return;
    }

    const [first, second] = result;
    
    // Safer splice: find index before mutation, then replace in place
    const newClips = [...clips];
    newClips.splice(idx, 1, first, second);

    pushToHistory(newClips);
    setSelectedClipIds(new Set([second.id]));
    toast({ title: "Clip split" });
  }, [clips, selectedClipIds, playheadPosition, pushToHistory, toast]);

  /** Delete selected clips */
  const deleteSelected = useCallback(
    (ripple = false) => {
      if (selectedClipIds.size === 0) return;

      let newClips = [...clips];
      for (const id of selectedClipIds) {
        newClips = ripple ? rippleDeleteClip(newClips, id) : deleteClip(newClips, id);
      }

      pushToHistory(newClips);
      clearSelection();
      toast({ title: `${selectedClipIds.size} clip(s) deleted` });
    },
    [clips, selectedClipIds, pushToHistory, clearSelection, toast]
  );

  /** Duplicate selected clip */
  const duplicateSelected = useCallback(() => {
    if (selectedClipIds.size !== 1) {
      toast({ title: "Select a single clip to duplicate", variant: "destructive" });
      return;
    }

    const clipId = Array.from(selectedClipIds)[0];
    const newClips = duplicateClip(clips, clipId);
    
    if (newClips.length > clips.length) {
      pushToHistory(newClips);
      // Select the new clip (it's right after the original)
      const origIndex = clips.findIndex((c) => c.id === clipId);
      const newClip = newClips[origIndex + 1];
      if (newClip) {
        setSelectedClipIds(new Set([newClip.id]));
      }
      toast({ title: "Clip duplicated" });
    }
  }, [clips, selectedClipIds, pushToHistory, toast]);

  /** Reorder clips via drag and drop */
  const reorderClips = useCallback(
    (fromIndex: number, toIndex: number) => {
      const newClips = moveClip(clips, fromIndex, toIndex);
      pushToHistory(newClips);
    },
    [clips, pushToHistory]
  );

  /** Toggle clip disabled state */
  const toggleDisabled = useCallback(() => {
    if (selectedClipIds.size === 0) return;

    const newClips = clips.map((c) =>
      selectedClipIds.has(c.id) ? { ...c, disabled: !c.disabled } : c
    );
    pushToHistory(newClips);
  }, [clips, selectedClipIds, pushToHistory]);

  /** Update a clip's prompt */
  const updateClipPrompt = useCallback(
    (clipId: string, prompt: string) => {
      const newClips = clips.map((c) =>
        c.id === clipId ? { ...c, prompt } : c
      );
      pushToHistory(newClips);
    },
    [clips, pushToHistory]
  );

  /** Add a new clip at the end */
  const addClip = useCallback(
    (prompt: string, durationSeconds = defaultSceneDuration) => {
      const lastEnd = clips.length > 0 ? Math.max(...clips.map((c) => c.end)) : 0;
      const newClip: Clip = {
        id: generateClipId(),
        type: "video",
        start: lastEnd,
        end: lastEnd + durationSeconds,
        prompt,
        created_at: new Date().toISOString(),
      };

      pushToHistory([...clips, newClip]);
      setSelectedClipIds(new Set([newClip.id]));
      toast({ title: "Scene added" });
    },
    [clips, defaultSceneDuration, pushToHistory, toast]
  );

  /** Extend last clip (for "continue from last frame") */
  const extendLastClip = useCallback(
    (additionalDuration: number, newPrompt?: string) => {
      if (clips.length === 0) {
        toast({ title: "No clips to extend", variant: "destructive" });
        return null;
      }

      const lastClip = clips.reduce((a, b) => (a.end > b.end ? a : b));
      const newClip: Clip = {
        id: generateClipId(),
        type: "video",
        start: lastClip.end,
        end: lastClip.end + additionalDuration,
        prompt: newPrompt || `Continue from previous: ${lastClip.prompt?.slice(0, 50)}...`,
        settings: {
          ...lastClip.settings,
          continue_from: lastClip.id,
        },
        created_at: new Date().toISOString(),
      };

      pushToHistory([...clips, newClip]);
      setSelectedClipIds(new Set([newClip.id]));
      return newClip;
    },
    [clips, pushToHistory, toast]
  );

  // ========== Trim Operations ==========

  /** Live trim preview (no history) - for dragging */
  const previewTrim = useCallback(
    (clipId: string, newStart?: number, newEnd?: number) => {
      const idx = clips.findIndex((c) => c.id === clipId);
      if (idx === -1) return;

      const current = clips[idx];
      
      // Calculate new values with constraints
      let targetStart = newStart ?? current.start;
      let targetEnd = newEnd ?? current.end;
      
      // Prevent inversion and ensure minimum duration
      const minDuration = 0.1;
      if (targetEnd - targetStart < minDuration) {
        if (newStart !== undefined) {
          targetStart = targetEnd - minDuration;
        } else {
          targetEnd = targetStart + minDuration;
        }
      }
      
      // Clamp start to 0
      if (targetStart < 0) targetStart = 0;

      // Use trimClip utility to properly update source in/out
      const trimmed = trimClip(current, targetStart, targetEnd);
      
      let next = [...clips];
      next[idx] = trimmed;

      // If ripple mode and trimming right edge, shift following clips
      if (rippleMode && newEnd !== undefined) {
        const before = next.slice(0, idx + 1);
        // Normalize after clips first, then reflow
        const after = reflowClipsSequential(next.slice(idx + 1));
        
        let t = before[before.length - 1].end;
        const afterOffset = after.map((c) => {
          const d = Math.max(0.01, c.end - c.start);
          const out = { ...c, start: t, end: t + d };
          t += d;
          return out;
        });
        
        next = [...before, ...afterOffset];
      }

      setClips(next);
    },
    [clips, setClips, rippleMode]
  );

  /** Commit trim (creates history entry) */
  const commitTrim = useCallback(
    (clipId: string, newStart?: number, newEnd?: number) => {
      const idx = clips.findIndex((c) => c.id === clipId);
      if (idx === -1) return;

      const current = clips[idx];
      
      let targetStart = newStart ?? current.start;
      let targetEnd = newEnd ?? current.end;
      
      const minDuration = 0.1;
      if (targetEnd - targetStart < minDuration) {
        if (newStart !== undefined) {
          targetStart = targetEnd - minDuration;
        } else {
          targetEnd = targetStart + minDuration;
        }
      }
      
      if (targetStart < 0) targetStart = 0;

      // Use trimClip utility to properly update source in/out
      const trimmed = trimClip(current, targetStart, targetEnd);
      
      let next = [...clips];
      next[idx] = trimmed;

      if (rippleMode && newEnd !== undefined) {
        const before = next.slice(0, idx + 1);
        // Normalize after clips first, then reflow
        const after = reflowClipsSequential(next.slice(idx + 1));
        
        let t = before[before.length - 1].end;
        const afterOffset = after.map((c) => {
          const d = Math.max(0.01, c.end - c.start);
          const out = { ...c, start: t, end: t + d };
          t += d;
          return out;
        });
        
        next = [...before, ...afterOffset];
      }

      pushToHistory(next);
    },
    [clips, pushToHistory, rippleMode]
  );

  // ========== Undo/Redo ==========

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

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  // ========== Persistence ==========

  const saveMutation = useMutation({
    mutationFn: async () => {
      const timelineData: TimelineData = {
        clips,
        duration: calculateTimelineDuration(clips),
      };

      // Always INSERT a new version to preserve history
      const nextVersion = (timelineRecord?.version || 0) + 1;

      const { error } = await supabase.from("studio_timelines").insert({
        script_run_id: script.id,
        timeline_json: timelineData as unknown as Json,
        version: nextVersion,
        label: null,
      });

      if (error) throw error;

      // Also update script_runs.script_content.scene_prompts for backward compat
      const content = script.script_content as Record<string, unknown>;
      const scenePrompts = clips
        .filter((c) => c.type === "video" && c.prompt)
        .sort((a, b) => a.start - b.start)
        .map((c) => c.prompt);

      await supabase
        .from("script_runs")
        .update({
          script_content: { ...content, scene_prompts: scenePrompts },
        })
        .eq("id", script.id);
    },
    onSuccess: () => {
      toast({ title: "Timeline saved" });
      queryClient.invalidateQueries({ queryKey: ["studio-timeline", script.id] });
      queryClient.invalidateQueries({ queryKey: ["script-run", script.id] });
    },
    onError: (error) => {
      toast({
        title: "Failed to save timeline",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // ========== Keyboard Shortcuts ==========

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isTextInput =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      // B - Blade/Split
      if (e.code === "KeyB" && !e.metaKey && !e.ctrlKey && !isTextInput) {
        e.preventDefault();
        splitAtPlayhead();
        return;
      }

      // Delete/Backspace - Delete selected
      if ((e.code === "Delete" || e.code === "Backspace") && !isTextInput) {
        e.preventDefault();
        deleteSelected(e.shiftKey); // Shift for ripple delete
        return;
      }

      // D - Duplicate
      if (e.code === "KeyD" && !e.metaKey && !e.ctrlKey && !isTextInput) {
        e.preventDefault();
        duplicateSelected();
        return;
      }

      // Cmd/Ctrl+A - Select all
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyA" && !isTextInput) {
        e.preventDefault();
        selectAll();
        return;
      }

      // Escape - Clear selection
      if (e.code === "Escape") {
        clearSelection();
        return;
      }

      // Cmd/Ctrl+Z - Undo
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ" && !e.shiftKey) {
        if (isTextInput && !canUndo) return;
        e.preventDefault();
        undo();
        return;
      }

      // Cmd/Ctrl+Shift+Z or Ctrl+Y - Redo
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyZ") {
        if (isTextInput && !canRedo) return;
        e.preventDefault();
        redo();
        return;
      }
      if (e.ctrlKey && e.code === "KeyY") {
        if (isTextInput && !canRedo) return;
        e.preventDefault();
        redo();
        return;
      }

      // Cmd/Ctrl+S - Save
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyS") {
        e.preventDefault();
        if (isDirty && !saveMutation.isPending) {
          saveMutation.mutate();
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    splitAtPlayhead,
    deleteSelected,
    duplicateSelected,
    selectAll,
    clearSelection,
    undo,
    redo,
    canUndo,
    canRedo,
    isDirty,
    saveMutation,
  ]);

  return {
    // Clips
    clips,
    setClips,
    duration,
    isLoading: isLoadingTimeline,

    // Selection
    selectedClipIds,
    selectedClips,
    selectClip,
    clearSelection,
    selectAll,

    // Playhead
    playheadPosition,
    setPlayheadPosition,

    // Editing
    splitAtPlayhead,
    deleteSelected,
    duplicateSelected,
    reorderClips,
    toggleDisabled,
    updateClipPrompt,
    addClip,
    extendLastClip,

    // History
    undo,
    redo,
    canUndo,
    canRedo,
    historyLength: history.past.length,

    // Ripple mode
    rippleMode,
    setRippleMode,

    // Trim operations
    previewTrim,
    commitTrim,

    // Persistence
    isDirty,
    save: () => saveMutation.mutate(),
    isSaving: saveMutation.isPending,
    timelineVersion: timelineRecord?.version || 1,
  };
}
