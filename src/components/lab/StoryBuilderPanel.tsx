/**
 * StoryBuilderPanel
 * 
 * Multi-clip story creation with storyboard editor, per-scene prompts,
 * and continuity anchor controls.
 * 
 * Features:
 * - AI prompt enrichment before submission (Auto-Enhance toggle)
 * - Continuity anchors for consistent character/environment
 * - Drag-and-drop scene reordering
 */

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { nanoid } from "nanoid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Plus,
  Trash2,
  GripVertical,
  Play,
  ChevronDown,
  Film,
  Wand2,
  Loader2,
  Sparkles,
  AlertTriangle,
  Download,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ContinuityAnchorsEditor } from "./ContinuityAnchorsEditor";
import { ContinuityMonitor } from "./ContinuityMonitor";
import { StoryVideoPlayer } from "./StoryVideoPlayer";
import { StoryAnalysisPanel } from "./StoryAnalysisPanel";
import {
  type ContinuityAnchors,
  type StoryType,
  type StoryScene,
  type Storyboard,
  STORY_TYPE_CONFIGS,
} from "@/lib/continuity-scoring";
import { enrichPrompt, inferAnchorsFromScenes } from "@/lib/lab-engines";
import type { Tables } from "@/integrations/supabase/types";

type VideoJob = Tables<"video_jobs">;

interface StoryBuilderPanelProps {
  storyId?: string;
  onStoryCreated?: (storyId: string) => void;
  className?: string;
}

// Extended scene type with enriched prompt
interface EnrichedScene extends StoryScene {
  enrichedPrompt?: string;
}

const DEFAULT_ACCOUNT_ID = "lab_sandbox";

/**
 * Get minimal default anchors - AI will fill in the rest
 */
function getDefaultAnchors(): ContinuityAnchors {
  return {
    negative_list: ["flicker", "jitter", "identity drift", "morph"],
  };
}

/**
 * Check for empty prompts only (AI handles the rest)
 */
function getContinuityWarnings(_anchors: ContinuityAnchors, scenes: StoryScene[]): string[] {
  const warnings: string[] = [];
  
  // Check for empty prompts - this is the only thing user MUST provide
  const emptyPrompts = scenes.filter(s => !s.prompt.trim());
  if (emptyPrompts.length > 0) {
    warnings.push(`${emptyPrompts.length} scene(s) have empty prompts`);
  }
  
  return warnings;
}

export function StoryBuilderPanel({
  storyId,
  onStoryCreated,
  className,
}: StoryBuilderPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local state for new/editing story
  const [title, setTitle] = useState("");
  const [storyType, setStoryType] = useState<StoryType>("short_story");
  const [scenes, setScenes] = useState<StoryScene[]>([]);
  const [anchors, setAnchors] = useState<ContinuityAnchors>(getDefaultAnchors());
  const [isGenerating, setIsGenerating] = useState(false);
  
  // AI prompt enrichment
  const [autoEnhance, setAutoEnhance] = useState(true);
  const [enrichmentProgress, setEnrichmentProgress] = useState(0);
  const [enrichmentStatus, setEnrichmentStatus] = useState<string | null>(null);
  
  // AI story generation
  const [concept, setConcept] = useState("");
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  
  // Assembly state
  const [isAssembling, setIsAssembling] = useState(false);
  const [assembledUrl, setAssembledUrl] = useState<string | null>(null);
  
  // Continuity completeness check
  const continuityWarnings = getContinuityWarnings(anchors, scenes);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Load most recent story if no storyId provided
  const { data: recentStory } = useQuery({
    queryKey: ["recent-story"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !storyId,
  });

  // Use provided storyId or fall back to most recent story
  const effectiveStoryId = storyId || recentStory?.id;

  // Load existing story if storyId provided
  const { data: existingStory, isLoading: storyLoading } = useQuery({
    queryKey: ["story-job", effectiveStoryId],
    queryFn: async () => {
      if (!effectiveStoryId) return null;
      const { data, error } = await supabase
        .from("story_jobs")
        .select("*")
        .eq("id", effectiveStoryId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveStoryId,
  });

  // Load clips for existing story - deduplicated to show best clip per sequence_index
  // Also filters out clips that don't match current storyboard prompts (from previous versions)
  const { data: storyClips = [] } = useQuery({
    queryKey: ["story-clips", effectiveStoryId, scenes.map(s => s.prompt.slice(0, 30)).join("|")],
    queryFn: async () => {
      if (!effectiveStoryId) return [];
      const { data, error } = await supabase
        .from("video_jobs")
        .select("*")
        .eq("story_job_id", effectiveStoryId)
        .order("sequence_index", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      
      // Build a map of expected prompts per scene index for filtering
      const scenePromptPrefixes = scenes.map(s => 
        s.prompt.toLowerCase().trim().slice(0, 40)
      );
      
      // Filter clips: only include those whose prompt matches the current scene
      // This prevents showing clips from previous story versions
      const relevantClips = (data as VideoJob[]).filter(clip => {
        const idx = clip.sequence_index ?? -1;
        if (idx < 0 || idx >= scenePromptPrefixes.length) return true; // Keep if we can't verify
        
        const clipPrompt = (clip.original_prompt || "").toLowerCase().trim().slice(0, 40);
        const expectedPrefix = scenePromptPrefixes[idx];
        
        // Allow if prompt is empty (can't verify) or matches the expected scene
        if (!expectedPrefix || !clipPrompt) return true;
        
        // Check if prompts share significant overlap (at least 20 chars matching)
        const minLen = Math.min(clipPrompt.length, expectedPrefix.length, 20);
        return clipPrompt.slice(0, minLen) === expectedPrefix.slice(0, minLen);
      });
      
      // Deduplicate: keep only the best clip per sequence_index
      // Priority: done > running/queued > failed, then most recent
      const clipsByIndex = new Map<number, VideoJob>();
      
      for (const clip of relevantClips) {
        const idx = clip.sequence_index ?? -1;
        const existing = clipsByIndex.get(idx);
        
        if (!existing) {
          clipsByIndex.set(idx, clip);
          continue;
        }
        
        // Compare: prefer done status, then running, then failed
        const statusPriority = (status: string) => {
          if (status === "done" || status === "rendered") return 3;
          if (status === "running" || status === "queued") return 2;
          return 1; // failed or other
        };
        
        const existingPriority = statusPriority(existing.status);
        const newPriority = statusPriority(clip.status);
        
        // Replace if new clip has higher priority, or same priority but newer
        if (newPriority > existingPriority) {
          clipsByIndex.set(idx, clip);
        } else if (newPriority === existingPriority) {
          // Same priority - keep the newer one
          if (new Date(clip.created_at) > new Date(existing.created_at)) {
            clipsByIndex.set(idx, clip);
          }
        }
      }
      
      // Return sorted by sequence_index
      return Array.from(clipsByIndex.values())
        .sort((a, b) => (a.sequence_index ?? 0) - (b.sequence_index ?? 0));
    },
    enabled: !!effectiveStoryId,
    refetchInterval: effectiveStoryId ? 5000 : false,
  });

  // Auto-complete story when all clips are done
  useEffect(() => {
    if (!existingStory || !storyClips.length) return;
    
    const totalExpected = existingStory.total_clips || scenes.length;
    const doneClips = storyClips.filter(c => c.status === "done" || c.status === "rendered");
    const allDone = doneClips.length >= totalExpected && totalExpected > 0;
    const isGeneratingStatus = existingStory.status === "generating";
    
    // If story is stuck in "generating" but all clips are done, mark it complete
    if (isGeneratingStatus && allDone) {
      supabase
        .from("story_jobs")
        .update({ 
          status: "done", 
          completed_clips: doneClips.length,
        })
        .eq("id", existingStory.id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["story-job", effectiveStoryId] });
          queryClient.invalidateQueries({ queryKey: ["recent-story"] });
        });
    }
  }, [existingStory, storyClips, scenes.length, effectiveStoryId, queryClient]);

  // Hydrate from existing story
  useEffect(() => {
    if (!existingStory) return;
    setTitle(existingStory.title || "");
    setStoryType((existingStory.story_type as StoryType) || "short_story");
    setAnchors((existingStory.continuity_anchors as unknown as ContinuityAnchors) || {});
    const storyboard = existingStory.storyboard_json as unknown as Storyboard | null;
    setScenes(storyboard?.scenes || []);
  }, [existingStory]);

  // Create story mutation
  const createStory = useMutation({
    mutationFn: async () => {
      const storyboard: Storyboard = { scenes };
      
      const { data, error } = await supabase
        .from("story_jobs")
        .insert([{
          account_id: DEFAULT_ACCOUNT_ID,
          title: title || `Story ${new Date().toLocaleDateString()}`,
          story_type: storyType,
          storyboard_json: JSON.parse(JSON.stringify(storyboard)),
          continuity_anchors: JSON.parse(JSON.stringify(anchors)),
          total_clips: scenes.length,
          status: "draft",
        }])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Story created", description: `${scenes.length} scenes ready` });
      queryClient.invalidateQueries({ queryKey: ["story-jobs"] });
      onStoryCreated?.(data.id);
    },
    onError: (error) => {
      toast({ title: "Failed to create story", description: String(error), variant: "destructive" });
    },
  });

  // Generate all clips mutation - uses smart hybrid chaining
  // First clip starts immediately, remaining clips wait for previous and use its last frame
  const generateAllClips = useMutation({
    mutationFn: async (targetStoryId: string) => {
      setIsGenerating(true);
      setEnrichmentProgress(0);
      setEnrichmentStatus(null);
      
      // Check if anchors need auto-inference (mostly empty)
      let workingAnchors = anchors;
      const needsInference = !anchors.character?.description && 
                            !anchors.environment?.location &&
                            scenes.length > 0;
      
      if (needsInference && autoEnhance) {
        setEnrichmentStatus("Analyzing scenes for continuity...");
        setEnrichmentProgress(10);
        
        const scenePrompts = scenes.map(s => s.prompt).filter(p => p.trim());
        if (scenePrompts.length > 0) {
          const inferred = await inferAnchorsFromScenes(scenePrompts);
          if (!inferred.error) {
            // Merge inferred anchors with any user-provided values
            workingAnchors = {
              character: inferred.character || anchors.character,
              environment: inferred.environment || anchors.environment,
              camera_language: inferred.camera_language || anchors.camera_language,
              negative_list: inferred.negative_list || anchors.negative_list,
            };
            // Update local state and DB
            setAnchors(workingAnchors);
            await supabase
              .from("story_jobs")
              .update({ continuity_anchors: JSON.parse(JSON.stringify(workingAnchors)) })
              .eq("id", targetStoryId);
          }
        }
        setEnrichmentProgress(25);
      }

      // Build continuity context for enrichment
      const continuityContext = buildContinuityContext(workingAnchors);
      
      // If auto-enhance is enabled, enrich all prompts first
      let enrichedScenes: EnrichedScene[] = scenes.map(s => ({ ...s }));
      if (autoEnhance) {
        setEnrichmentStatus("Enhancing prompts with AI...");
        enrichedScenes = await enrichAllPrompts(scenes, continuityContext);
        setEnrichmentProgress(50);
      }

      setEnrichmentStatus("Starting smart chained generation (best provider per scene)...");
      setEnrichmentProgress(60);
      
      // Use smart hybrid chaining: first clip immediate, rest wait for previous
      // Each scene uses intelligent provider routing based on content type
      const { data, error } = await supabase.functions.invoke("generate-story-chained", {
        body: {
          story_job_id: targetStoryId,
          scenes: enrichedScenes.map(scene => ({
            id: scene.id,
            prompt: scene.prompt,
            enriched_prompt: scene.enrichedPrompt,
            duration_target: scene.duration_target,
            camera_direction: scene.camera_direction,
            // shot_type inferred server-side from prompt content
          })),
          anchors: workingAnchors,
          settings: {
            size: "16:9",
            provider: "smart", // Use intelligent per-scene provider selection
          },
        },
      });
      
      if (error) throw error;
      
      setEnrichmentStatus(null);
      setEnrichmentProgress(100);

      return { 
        succeeded: data?.summary?.succeeded || 0, 
        failed: data?.summary?.failed || 0, 
        total: scenes.length,
        isChained: true,
      };
    },
    onSuccess: (result) => {
      setIsGenerating(false);
      setEnrichmentProgress(0);
      toast({
        title: "Chained generation complete",
        description: `${result.succeeded}/${result.total} clips completed with frame continuity`,
      });
      queryClient.invalidateQueries({ queryKey: ["story-clips", storyId] });
    },
    onError: (error) => {
      setIsGenerating(false);
      setEnrichmentProgress(0);
      setEnrichmentStatus(null);
      toast({ 
        title: "Generation failed", 
        description: String(error),
        variant: "destructive" 
      });
    },
  });

  /**
   * Build rich continuity context from anchors for prompt enrichment
   * This creates a comprehensive "show bible" that the AI uses to maintain consistency
   */
  function buildContinuityContext(anchors: ContinuityAnchors): string {
    const sections: string[] = [];
    
    // Character Bible - critical for identity consistency
    if (anchors.character) {
      const charParts: string[] = [];
      if (anchors.character.description) {
        charParts.push(`Description: ${anchors.character.description}`);
      }
      if (anchors.character.wardrobe) {
        charParts.push(`Wardrobe: ${anchors.character.wardrobe}`);
      }
      if (anchors.character.identity_lock_tokens?.length) {
        charParts.push(`Identity tokens (MUST PRESERVE): ${anchors.character.identity_lock_tokens.join(", ")}`);
      }
      if (charParts.length > 0) {
        sections.push(`=== CHARACTER BIBLE ===\n${charParts.join("\n")}`);
      }
    }
    
    // Environment Bible - for location continuity
    if (anchors.environment) {
      const envParts: string[] = [];
      if (anchors.environment.location) {
        envParts.push(`Location: ${anchors.environment.location}`);
      }
      if (anchors.environment.time_of_day) {
        envParts.push(`Time of day: ${anchors.environment.time_of_day}`);
      }
      if (anchors.environment.props?.length) {
        envParts.push(`Key props (MUST APPEAR): ${anchors.environment.props.join(", ")}`);
      }
      if (envParts.length > 0) {
        sections.push(`=== ENVIRONMENT BIBLE ===\n${envParts.join("\n")}`);
      }
    }
    
    // Camera Language - for visual consistency
    if (anchors.camera_language) {
      const camParts: string[] = [];
      if (anchors.camera_language.lens) {
        camParts.push(`Lens: ${anchors.camera_language.lens}`);
      }
      if (anchors.camera_language.movement_style) {
        camParts.push(`Movement style: ${anchors.camera_language.movement_style}`);
      }
      if (anchors.camera_language.framing_rules) {
        camParts.push(`Framing: ${anchors.camera_language.framing_rules}`);
      }
      if (camParts.length > 0) {
        sections.push(`=== CAMERA LANGUAGE ===\n${camParts.join("\n")}`);
      }
    }
    
    // Negative constraints - artifacts to avoid
    if (anchors.negative_list?.length) {
      sections.push(`=== AVOID (NEGATIVE PROMPTS) ===\n${anchors.negative_list.join(", ")}`);
    }
    
    return sections.join("\n\n");
  }

  /**
   * Enrich all scene prompts with AI, maintaining continuity context
   */
  async function enrichAllPrompts(
    scenes: StoryScene[],
    continuityContext: string
  ): Promise<EnrichedScene[]> {
    const enrichedScenes = await Promise.all(
      scenes.map(async (scene, index) => {
        try {
          // Build comprehensive scene context
          const scenePosition = index === 0 ? "OPENING" : 
                               index === scenes.length - 1 ? "CLOSING" : 
                               `MIDDLE (${index + 1}/${scenes.length})`;
          
          const sceneContext = [
            continuityContext,
            `=== SCENE POSITION ===`,
            `Position: ${scenePosition}`,
            `Duration target: ${scene.duration_target}s`,
            scene.camera_direction ? `Camera direction: ${scene.camera_direction}` : "",
            // Add previous scene context for continuity
            index > 0 ? `Previous scene: ${scenes[index - 1].prompt.substring(0, 100)}...` : "",
          ].filter(Boolean).join("\n");
          
          const { enriched, error } = await enrichPrompt(
            scene.prompt,
            "sora", // Default to sora optimization
            sceneContext
          );
          
          if (error) {
            console.warn(`Failed to enrich scene ${index + 1}:`, error);
            return { ...scene, enrichedPrompt: scene.prompt };
          }
          
          return { ...scene, enrichedPrompt: enriched };
        } catch (err) {
          console.error(`Enrichment error for scene ${index + 1}:`, err);
          return { ...scene, enrichedPrompt: scene.prompt };
        }
      })
    );
    
    return enrichedScenes;
  }

  // AI Story Generation
  const generateStory = useMutation({
    mutationFn: async () => {
      if (!concept.trim()) throw new Error("Enter a concept first");
      
      setIsGeneratingStory(true);
      const { data, error } = await supabase.functions.invoke("generate-storyboard", {
        body: {
          concept: concept.trim(),
          story_type: storyType,
        },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      setIsGeneratingStory(false);
      // Set the generated content
      if (data.title) setTitle(data.title);
      if (data.scenes?.length) {
        setScenes(data.scenes.map((s: StoryScene, i: number) => ({
          ...s,
          id: s.id || nanoid(8),
          sequence_index: i,
        })));
      }
      if (data.anchors) setAnchors(data.anchors);
      setConcept(""); // Clear input
      toast({
        title: "Story generated!",
        description: `Created ${data.scenes?.length || 0} scenes. Review and generate.`,
      });
    },
    onError: (error) => {
      setIsGeneratingStory(false);
      toast({
        title: "Failed to generate story",
        description: String(error),
        variant: "destructive",
      });
    },
  });

  // Scene management
  const addScene = () => {
    const config = STORY_TYPE_CONFIGS[storyType];
    setScenes(prev => [
      ...prev,
      {
        id: nanoid(8),
        prompt: "",
        duration_target: config.defaultDuration,
        sequence_index: prev.length,
      },
    ]);
  };

  const updateScene = (id: string, updates: Partial<StoryScene>) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeScene = (id: string) => {
    setScenes(prev => {
      const filtered = prev.filter(s => s.id !== id);
      return filtered.map((s, i) => ({ ...s, sequence_index: i }));
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setScenes(prev => {
      const oldIndex = prev.findIndex(s => s.id === active.id);
      const newIndex = prev.findIndex(s => s.id === over.id);
      const reordered = arrayMove(prev, oldIndex, newIndex);
      return reordered.map((s, i) => ({ ...s, sequence_index: i }));
    });
  };

  const handleGenerate = async () => {
    if (scenes.length === 0) {
      toast({ title: "Add at least one scene", variant: "destructive" });
      return;
    }

    if (storyId) {
      // Update existing story then generate
      await supabase
        .from("story_jobs")
        .update({
          storyboard_json: JSON.parse(JSON.stringify({ scenes })),
          continuity_anchors: JSON.parse(JSON.stringify(anchors)),
          total_clips: scenes.length,
        })
        .eq("id", storyId);
      
      generateAllClips.mutate(storyId);
    } else {
      // Create new story first
      createStory.mutate(undefined, {
        onSuccess: (data) => {
          generateAllClips.mutate(data.id);
        },
      });
    }
  };

  // Assemble clips into a single video
  const handleAssemble = async () => {
    if (!storyId || storyClips.length === 0) return;
    
    const completedClips = storyClips.filter(c => c.status === "done" && c.output_url);
    if (completedClips.length === 0) {
      toast({ title: "No clips to assemble", description: "Wait for clips to complete", variant: "destructive" });
      return;
    }
    
    setIsAssembling(true);
    
    try {
      // Get or create a script_run_id for assembly (reuse first clip's)
      const scriptRunId = completedClips[0].script_run_id;
      
      const response = await supabase.functions.invoke("assemble-reel", {
        body: {
          script_run_id: scriptRunId,
          transition_type: "crossfade",
          transition_duration: 0.3,
          output_width: 720,
          output_height: 1280,
        },
      });
      
      if (response.error) {
        throw new Error(response.error.message);
      }
      
      if (response.data?.assembled_video_url) {
        setAssembledUrl(response.data.assembled_video_url);
        toast({ title: "Video assembled!", description: "Your story is ready to download" });
      } else if (response.data?.status === "queued" || response.data?.status === "rendering") {
        toast({ 
          title: "Assembly started", 
          description: "Video is being rendered. This may take a minute." 
        });
        // Poll for completion
        pollAssemblyStatus(scriptRunId);
      }
    } catch (err) {
      console.error("Assembly error:", err);
      toast({ 
        title: "Assembly failed", 
        description: err instanceof Error ? err.message : "Unknown error", 
        variant: "destructive" 
      });
    } finally {
      setIsAssembling(false);
    }
  };

  // Poll for assembly completion
  const pollAssemblyStatus = async (scriptRunId: string) => {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;
    
    const poll = async () => {
      attempts++;
      const { data } = await supabase
        .from("script_runs")
        .select("assembled_status, assembled_video_url")
        .eq("id", scriptRunId)
        .single();
      
      if (data?.assembled_status === "succeeded" && data?.assembled_video_url) {
        setAssembledUrl(data.assembled_video_url);
        toast({ title: "Video ready!", description: "Your story has been assembled" });
        return;
      }
      
      if (data?.assembled_status === "failed") {
        toast({ title: "Assembly failed", variant: "destructive" });
        return;
      }
      
      if (attempts < maxAttempts) {
        setTimeout(poll, 5000);
      }
    };
    
    poll();
  };

  const config = STORY_TYPE_CONFIGS[storyType];

  if (storyLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Calculate progress for header bar
  const totalClips = existingStory?.total_clips || scenes.length;
  const completedClips = storyClips.filter(c => c.status === "done").length;
  const runningClips = storyClips.filter(c => c.status === "running" || c.status === "queued").length;
  const progressPercent = totalClips > 0 ? Math.round((completedClips / totalClips) * 100) : 0;
  const isStoryGenerating = existingStory?.status === "generating" || runningClips > 0;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Story Progress Header - shows during/after generation */}
      {(existingStory || storyClips.length > 0) && totalClips > 0 && (
        <div className="px-4 py-2 border-b bg-card/50 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Film className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium truncate max-w-[200px]">
                {existingStory?.title || "Story"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isStoryGenerating && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              )}
              <Badge 
                variant={completedClips === totalClips ? "default" : "secondary"} 
                className="text-[10px] h-5"
              >
                {completedClips}/{totalClips} clips
              </Badge>
            </div>
          </div>
          <Progress 
            value={progressPercent} 
            className={`h-1.5 ${isStoryGenerating ? "animate-pulse" : ""}`}
          />
          {isStoryGenerating && runningClips > 0 && (
            <p className="text-[10px] text-muted-foreground">
              {runningClips} clip{runningClips > 1 ? "s" : ""} rendering...
            </p>
          )}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* AI Story Generator - Primary Input */}
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <Label className="text-sm font-medium">Describe your story</Label>
              </div>
              <Textarea
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="E.g., A lonely astronaut discovers a garden growing on Mars..."
                className="h-20 text-sm resize-none"
              />
              <div className="flex gap-2">
                <Select value={storyType} onValueChange={(v) => setStoryType(v as StoryType)}>
                  <SelectTrigger className="h-8 text-xs flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STORY_TYPE_CONFIGS).map(([key, cfg]) => (
                      <SelectItem key={key} value={key} className="text-xs">
                        <span className="font-medium">{cfg.name}</span>
                        <span className="text-muted-foreground ml-2">
                          {cfg.typicalClipCount[0]}-{cfg.typicalClipCount[1]} clips
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={() => generateStory.mutate()}
                  disabled={!concept.trim() || isGeneratingStory}
                  className="h-8"
                >
                  {isGeneratingStory ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Wand2 className="h-4 w-4 mr-2" />
                  )}
                  {isGeneratingStory ? "Creating..." : "Build Story"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Generated/Manual Story Details */}
          {scenes.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Film className="h-5 w-5 text-primary" />
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Story title..."
                  className="h-8 text-sm font-medium flex-1"
                />
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-[10px]">
                  {config.clipPacing} cuts
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  {config.continuityStrictness}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  {scenes.length} scenes
                </Badge>
              </div>
            </div>
          )}

          {/* Continuity Anchors - collapsed by default, AI fills these */}
          {scenes.length > 0 && (
            <Collapsible>
              <Card>
                <CollapsibleTrigger asChild>
                  <CardHeader className="py-2 px-3 cursor-pointer hover:bg-accent/50 transition-colors">
                    <CardTitle className="text-xs font-medium flex items-center gap-2">
                      <Wand2 className="h-3.5 w-3.5" />
                      Continuity Anchors
                      {anchors.character?.description && (
                        <Badge variant="secondary" className="text-[10px] ml-1">AI-filled</Badge>
                      )}
                      <ChevronDown className="h-3 w-3 ml-auto" />
                    </CardTitle>
                  </CardHeader>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="pt-0 pb-3 px-3">
                    <ContinuityAnchorsEditor
                      anchors={anchors}
                      onChange={setAnchors}
                      discoveredArtifacts={["flicker", "jitter", "identity_drift"]}
                    />
                  </CardContent>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}

          {/* Scenes */}
          <Card>
            <CardHeader className="py-2 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-medium">
                  Scenes ({scenes.length})
                </CardTitle>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={addScene}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add Scene
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-3 px-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={scenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {scenes.map((scene, index) => (
                      <SortableScene
                        key={scene.id}
                        scene={scene}
                        index={index}
                        defaultDuration={config.defaultDuration}
                        onUpdate={(updates) => updateScene(scene.id, updates)}
                        onRemove={() => removeScene(scene.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>

              {scenes.length === 0 && (
                <div className="py-6 border-2 border-dashed rounded-lg text-center text-sm text-muted-foreground">
                  <Sparkles className="h-5 w-5 mx-auto mb-2 text-primary" />
                  <p className="font-medium">Describe your story above</p>
                  <p className="text-xs mt-1">AI will create all scenes for you</p>
                  <button
                    onClick={addScene}
                    className="mt-3 text-xs text-primary hover:underline"
                  >
                    or add scenes manually
                  </button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Continuity Monitor (for existing stories with clips) */}
          {storyClips.length > 0 && (
            <ContinuityMonitor
              clips={storyClips}
              storyType={storyType}
              anchors={anchors}
              onRegenerateClip={(clipId, suggestion) => {
                toast({
                  title: "Regeneration queued",
                  description: `Clip will regenerate with ${suggestion.provider || "same provider"}`,
                });
                // TODO: Implement actual regeneration
              }}
            />
          )}

          {/* Video Player - shows when clips are available */}
          {storyClips.some(c => c.status === "done" && c.output_url) && (
            <Card>
              <CardHeader className="py-2 px-3">
                <CardTitle className="text-xs font-medium flex items-center gap-2">
                  <Film className="h-3.5 w-3.5" />
                  Preview Story
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <StoryVideoPlayer
                  clips={storyClips}
                  onAssemble={handleAssemble}
                  isAssembling={isAssembling}
                  assembledUrl={assembledUrl}
                  className="aspect-[9/16] max-h-[400px]"
                />
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="p-3 border-t bg-card/50 space-y-3">
        {/* Auto-Enhance Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <Label htmlFor="auto-enhance" className="text-xs font-medium cursor-pointer">
              AI Auto-Enhance
            </Label>
          </div>
          <Switch
            id="auto-enhance"
            checked={autoEnhance}
            onCheckedChange={setAutoEnhance}
          />
        </div>
        
        {autoEnhance && (
          <p className="text-[10px] text-muted-foreground">
            AI will analyze your scenes to infer character, environment &amp; camera settings, then enhance each prompt with cinematic details
          </p>
        )}

        {/* Progress indicator during generation */}
        {isGenerating && enrichmentStatus && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">{enrichmentStatus}</span>
              <span className="font-mono">{enrichmentProgress}%</span>
            </div>
            <Progress value={enrichmentProgress} className="h-1" />
          </div>
        )}

        {/* Continuity Warnings */}
        {continuityWarnings.length > 0 && !isGenerating && (
          <div className="p-2 rounded-md bg-destructive/10 border border-destructive/30 space-y-1">
            <div className="flex items-center gap-1.5 text-destructive">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Continuity Warnings</span>
            </div>
            <ul className="text-[10px] text-muted-foreground space-y-0.5 pl-5">
              {continuityWarnings.map((warning, i) => (
                <li key={i} className="list-disc">{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Generate Button */}
        <Button
          className="w-full"
          disabled={scenes.length === 0 || isGenerating || createStory.isPending}
          onClick={handleGenerate}
        >
          {isGenerating || createStory.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : autoEnhance ? (
            <Sparkles className="h-4 w-4 mr-2" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          {isGenerating 
            ? enrichmentStatus || "Generating..." 
            : `Generate ${scenes.length} Clips${autoEnhance ? " (AI Enhanced)" : ""}`
          }
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// SortableScene
// ============================================================================

interface SortableSceneProps {
  scene: StoryScene;
  index: number;
  defaultDuration: number;
  onUpdate: (updates: Partial<StoryScene>) => void;
  onRemove: () => void;
}

function SortableScene({ scene, index, defaultDuration, onUpdate, onRemove }: SortableSceneProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: scene.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex gap-2 p-2 border rounded-lg bg-background"
    >
      <button
        {...attributes}
        {...listeners}
        className="flex-shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Label className="text-[10px] text-muted-foreground w-4">#{index + 1}</Label>
          <Textarea
            value={scene.prompt}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            placeholder="Scene prompt..."
            className="h-14 text-xs flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(scene.duration_target)}
            onValueChange={(v) => onUpdate({ duration_target: Number(v) })}
          >
            <SelectTrigger className="h-7 text-xs w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[3, 4, 5, 6, 8, 10, 12].map(d => (
                <SelectItem key={d} value={String(d)} className="text-xs">{d}s</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={scene.camera_direction || ""}
            onChange={(e) => onUpdate({ camera_direction: e.target.value })}
            placeholder="Camera direction..."
            className="h-7 text-xs flex-1"
          />
        </div>
      </div>

      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
