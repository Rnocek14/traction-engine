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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ContinuityAnchorsEditor } from "./ContinuityAnchorsEditor";
import { ContinuityMonitor } from "./ContinuityMonitor";
import { StoryVideoPlayer } from "./StoryVideoPlayer";
import { StoryAnalysisPanel } from "./StoryAnalysisPanel";
import { StoryNarrationPanel } from "./StoryNarrationPanel";
import {
  type ContinuityAnchors,
  type StoryType,
  type StoryScene,
  type Storyboard,
  type SceneRole,
  STORY_TYPE_CONFIGS,
  getScenePrompt,
  getSceneDuration,
  getSceneIndex,
} from "@/lib/continuity-scoring";
import { enrichPrompt, inferAnchorsFromScenes } from "@/lib/lab-engines";
import type { Tables } from "@/integrations/supabase/types";
import {
  SCENE_ROLE_CONFIGS,
  getProviderForRole,
  getProviderForRoleWithContext,
  ROLE_DISPLAY,
  PROVIDER_DISPLAY,
  COVERAGE_DISPLAY,
  DEFAULT_COVERAGE_BY_ROLE,
  ALTERNATE_SUBJECT_DISPLAY,
  inferRoleFromPosition,
  isSpectacleScene,
  type CoverageType,
  type AlternateSubject,
} from "@/types/scene-roles";

// Scene role options for selector
const AVAILABLE_ROLES: Array<{ value: SceneRole; label: string; color: string }> = [
  { value: "hook", label: "Hook", color: "bg-green-500" },
  { value: "problem", label: "Problem", color: "bg-blue-500" },
  { value: "story_a", label: "Story A", color: "bg-purple-500" },
  { value: "reset", label: "Reset", color: "bg-green-500" },
  { value: "story_b", label: "Story B", color: "bg-purple-500" },
  { value: "cta", label: "CTA", color: "bg-blue-500" },
  { value: "atmosphere", label: "Atmosphere", color: "bg-blue-500" },
  { value: "establish", label: "Establish", color: "bg-purple-500" },
];

/**
 * Scene Role Badge with provider indicator
 * 
 * ACCURATE ROUTING: Uses actual tier, soraUsedCount up to this scene,
 * and template context to show the real provider that will be used.
 */
function SceneRoleBadge({ 
  role, 
  sceneIndex, 
  totalScenes,
  tier = "volume",
  allRoles = [],
  soraUsedBeforeThis = 0,
}: { 
  role?: SceneRole; 
  sceneIndex: number;
  totalScenes: number;
  tier?: "volume" | "hero";
  allRoles?: SceneRole[];
  soraUsedBeforeThis?: number;
}) {
  // Infer role from position if not explicitly set (uses shared canonical function)
  const inferredRole = role || inferRoleFromPosition(sceneIndex, totalScenes);
  const config = SCENE_ROLE_CONFIGS[inferredRole];
  const roleDisplay = ROLE_DISPLAY[inferredRole];
  
  // Use context-aware routing for accurate provider display
  const provider = getProviderForRoleWithContext(
    inferredRole, 
    tier, 
    soraUsedBeforeThis,
    allRoles
  );
  const providerDisplay = PROVIDER_DISPLAY[provider];
  
  return (
    <div className="flex items-center gap-1">
      <Badge 
        variant="outline" 
        className={`text-[9px] px-1.5 py-0 h-5 ${config?.color || 'bg-muted'} text-white border-0`}
      >
        {roleDisplay?.shortLabel || inferredRole.slice(0, 2).toUpperCase()}
      </Badge>
      <span className="text-[9px] text-muted-foreground" title={`Routes to ${providerDisplay?.label} (${tier} tier)`}>
        {providerDisplay?.emoji}
      </span>
    </div>
  );
}

type VideoJob = Tables<"video_jobs">;

interface StoryBuilderPanelProps {
  storyId?: string;
  forceNew?: boolean; // When true, create a blank template instead of loading recent story
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
 * Compute cut_type for scenes if missing (deterministic based on roles)
 * Mirrors logic in generate-storyboard and continue-story-chain
 */
function ensureCutTypes(scenes: StoryScene[]): StoryScene[] {
  const CONTINUITY_SOURCE_ROLES = ["problem", "story_a", "story_b"];
  return scenes.map((scene, i) => {
    if (scene.cut_type) return scene; // Already has cut_type
    
    const role = scene.role || "story_a";
    const prevRole = i > 0 ? (scenes[i - 1].role || "story_a") : null;
    
    let computedCutType: "hard" | "continuity" = "hard";
    if (i === 0) {
      computedCutType = "hard"; // First scene always hard
    } else if (role === "hook" || role === "cta" || role === "reset") {
      computedCutType = "hard"; // These roles always hard
    } else if (role === "story_a" || role === "story_b") {
      // Continuity only if previous role is eligible
      computedCutType = prevRole && CONTINUITY_SOURCE_ROLES.includes(prevRole) 
        ? "continuity" 
        : "hard";
    }
    
    return { ...scene, cut_type: computedCutType };
  });
}


function getContinuityWarnings(_anchors: ContinuityAnchors, scenes: StoryScene[]): string[] {
  const warnings: string[] = [];
  
  // Check for empty prompts - this is the only thing user MUST provide
  const emptyPrompts = scenes.filter(s => !getScenePrompt(s).trim());
  if (emptyPrompts.length > 0) {
    warnings.push(`${emptyPrompts.length} scene(s) have empty prompts`);
  }
  
  return warnings;
}


export function StoryBuilderPanel({
  storyId,
  forceNew = false,
  onStoryCreated,
  className,
}: StoryBuilderPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local state for new/editing story
  const [title, setTitle] = useState("");
  const [storyType, setStoryType] = useState<StoryType>("short_story");
  const [tier, setTier] = useState<"volume" | "hero">("volume");
  const [scenes, setScenes] = useState<StoryScene[]>([]);
  const [anchors, setAnchors] = useState<ContinuityAnchors>(getDefaultAnchors());
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Character Continuity Mode - locks all scenes to single provider
  const [characterContinuityMode, setCharacterContinuityMode] = useState(false);
  const [lockedProvider, setLockedProvider] = useState<"sora" | "runway" | "luma">("sora");
  // Soft Continuity Mode - allow strategic T2V cuts for energy roles (hook, problem, reset, establish)
  const [softContinuity, setSoftContinuity] = useState(true);
  
  // Film Mode - new film-first architecture (face-only I2V, minimal prompts, variety contract)
  const [filmMode, setFilmMode] = useState(false);
  
  // Myth Mode - storybook fable style (silhouettes, symbolic, no faces)
  const [mythMode, setMythMode] = useState(false);
  
  // Brutality Mode - reduces sanitization for intense content (higher failure risk)
  const [brutalityMode, setBrutalityMode] = useState(false);
  const [sanitizationLevel, setSanitizationLevel] = useState<"soft" | "strict">("soft");
  
  // Story Spine (narrative structure from Director Brain)
  const [storySpine, setStorySpine] = useState<string>("");
  const [motifAnchors, setMotifAnchors] = useState<string[]>([]);
  const [paletteKeywords, setPaletteKeywords] = useState<string[]>([]);
  
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

  // Load most recent story if no storyId provided AND not in forceNew mode
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
    enabled: !storyId && !forceNew, // Don't load recent story if forceNew is true
  });

  // Use provided storyId or fall back to most recent story (unless forceNew)
  const effectiveStoryId = forceNew ? undefined : (storyId || recentStory?.id);

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
  const { data: storyClips = [], refetch: refetchClips } = useQuery({
    queryKey: ["story-clips", effectiveStoryId, scenes.map(s => getScenePrompt(s).slice(0, 30)).join("|")],
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
        getScenePrompt(s).toLowerCase().trim().slice(0, 40)
      );
      
      // Filter clips: only include those whose prompt matches the current scene
      // This prevents showing clips from previous story versions
      const relevantClips = (data as VideoJob[]).filter(clip => {
        const idx = clip.sequence_index ?? -1;
        if (idx < 0 || idx >= scenePromptPrefixes.length) return true; // Keep if we can't verify
        
        const clipPrompt = (clip.original_prompt || "").toLowerCase().trim();
        const expectedPrefix = scenePromptPrefixes[idx];
        
        // Allow if prompt is empty (can't verify) or matches the expected scene
        if (!expectedPrefix || !clipPrompt) return true;
        
        // For myth mode clips that start with style prefix, check if prompt CONTAINS the scene description
        // This handles cases like "[STYLE: ...] silhouette stands..." vs "silhouette stands..."
        if (clipPrompt.includes(expectedPrefix.slice(0, 20))) return true;
        
        // Check if prompts share significant overlap (at least 20 chars matching from start)
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
    refetchInterval: effectiveStoryId ? 5000 : false, // Backup polling
  });

  // Real-time subscription for instant progress updates
  useEffect(() => {
    if (!effectiveStoryId) return;

    const channel = supabase
      .channel(`story-clips-${effectiveStoryId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "video_jobs",
          filter: `story_job_id=eq.${effectiveStoryId}`,
        },
        () => {
          // Refetch on any change to video_jobs for this story
          refetchClips();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveStoryId, refetchClips]);

  // Active job processing trigger - polls process-video functions while jobs are running
  useEffect(() => {
    if (!storyClips.length) return;
    
    const activeJobs = storyClips.filter(
      c => c.status === "running" || c.status === "queued"
    );
    
    if (activeJobs.length === 0) return;

    // Determine which providers have active jobs
    const activeProviders = new Set(activeJobs.map(j => j.provider));
    
    const triggerProcessing = async () => {
      const calls = [];
      if (activeProviders.has("sora")) {
        calls.push(supabase.functions.invoke("process-video", { body: {} }));
      }
      if (activeProviders.has("runway")) {
        calls.push(supabase.functions.invoke("process-video-runway", { body: {} }));
      }
      if (activeProviders.has("luma")) {
        calls.push(supabase.functions.invoke("process-video-luma", { body: {} }));
      }
      if (calls.length > 0) {
        await Promise.allSettled(calls);
        refetchClips();
      }
    };

    // Trigger immediately, then every 5 seconds
    triggerProcessing();
    const interval = setInterval(triggerProcessing, 5000);
    
    return () => clearInterval(interval);
  }, [storyClips, refetchClips]);

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

  // Reset state when forceNew is true (creating a new blank story)
  useEffect(() => {
    if (forceNew) {
      setTitle("");
      setStoryType("short_story");
      setAnchors(getDefaultAnchors());
      setScenes([]);
      setConcept("");
      setAssembledUrl(null);
      // Reset Story Spine
      setStorySpine("");
      setMotifAnchors([]);
      setPaletteKeywords([]);
    }
  }, [forceNew]);

  // Hydrate from existing story (including Story Spine and Character Continuity Mode)
  useEffect(() => {
    if (forceNew || !existingStory) return;
    setTitle(existingStory.title || "");
    
    // Handle Film Mode and Myth Mode stories - auto-enable mode and map to valid type
    const rawStoryType = existingStory.story_type as string;
    if (rawStoryType === "film_continuity") {
      setFilmMode(true);
      setMythMode(false);
      setStoryType("film_continuity");
    } else if (rawStoryType === "myth") {
      setMythMode(true);
      setFilmMode(false);
      setStoryType("myth");
    } else {
      setFilmMode(false);
      setMythMode(false);
      setStoryType((rawStoryType as StoryType) || "short_story");
    }
    
    setAnchors((existingStory.continuity_anchors as unknown as ContinuityAnchors) || {});
    const storyboard = existingStory.storyboard_json as unknown as (Storyboard & { 
      tier?: "volume" | "hero";
      story_spine?: string;
      motif_anchors?: string[];
      palette_keywords?: string[];
      character_continuity_mode?: boolean;
      locked_provider?: "sora" | "runway" | "luma";
      soft_continuity?: boolean;
      brutality_mode?: boolean;
      sanitization_level?: "soft" | "strict";
    }) | null;
    // Ensure cut_type is computed for legacy stories without it
    setScenes(ensureCutTypes(storyboard?.scenes || []));
    setTier(storyboard?.tier || "volume");
    // Restore Story Spine if present
    setStorySpine(storyboard?.story_spine || "");
    setMotifAnchors(storyboard?.motif_anchors || []);
    setPaletteKeywords(storyboard?.palette_keywords || []);
    // Restore Character Continuity Mode
    setCharacterContinuityMode(storyboard?.character_continuity_mode || false);
    setLockedProvider(storyboard?.locked_provider || "sora");
    // Restore Soft Continuity (default true for new stories)
    setSoftContinuity(storyboard?.soft_continuity ?? true);
    // Restore Brutality Mode and Sanitization Level
    setBrutalityMode(storyboard?.brutality_mode || false);
    setSanitizationLevel(storyboard?.sanitization_level || "soft");
  }, [existingStory, forceNew]);

  // Create story mutation (preserves full Story Spine)
  const createStory = useMutation({
    mutationFn: async () => {
      // Ensure cut_type is present on all scenes
      const scenesWithCutType = ensureCutTypes(scenes);
      
      // Persist full narrative structure including Story Spine and Character Continuity Mode
      const fullStoryboard = { 
        scenes: scenesWithCutType,
        tier,
        story_spine: storySpine,
        motif_anchors: motifAnchors,
        palette_keywords: paletteKeywords,
        character_continuity_mode: characterContinuityMode,
        locked_provider: lockedProvider,
        soft_continuity: softContinuity,
        brutality_mode: brutalityMode,
        sanitization_level: sanitizationLevel,
      };
      
      const { data, error } = await supabase
        .from("story_jobs")
        .insert([{
          account_id: DEFAULT_ACCOUNT_ID,
          title: title || `Story ${new Date().toLocaleDateString()}`,
          story_type: storyType,
          storyboard_json: JSON.parse(JSON.stringify(fullStoryboard)),
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
      
      // Myth Mode: use the storybook continuation engine
      if (mythMode) {
        setEnrichmentStatus("📜 Myth Mode: generating symbolic scenes...");
        setEnrichmentProgress(30);
        
        const { data, error } = await supabase.functions.invoke("continue-story-myth-mode", {
          body: {
            story_job_id: targetStoryId,
          },
        });
        
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Myth mode generation failed");
        
        setEnrichmentStatus(null);
        setEnrichmentProgress(100);
        
        return {
          succeeded: data.summary?.queued || 0,
          failed: 0,
          total: data.summary?.total || scenes.length,
          isChained: true,
          mythMode: true,
        };
      }
      
      // Film Mode: use the new film-first continuation engine
      if (filmMode) {
        setEnrichmentStatus("🎬 Film Mode: starting generation...");
        setEnrichmentProgress(30);
        
        const { data, error } = await supabase.functions.invoke("continue-story-film-mode", {
          body: {
            story_job_id: targetStoryId,
          },
        });
        
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Film mode generation failed");
        
        setEnrichmentStatus(null);
        setEnrichmentProgress(100);
        
        return {
          succeeded: data.summary?.queued || 0,
          failed: 0,
          total: data.summary?.total || scenes.length,
          isChained: true,
          filmMode: true,
        };
      }
      
      // Legacy path: Check if anchors need auto-inference (mostly empty)
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
            prompt: getScenePrompt(scene),
            enriched_prompt: scene.enrichedPrompt,
            duration_target: getSceneDuration(scene),
            camera_direction: scene.camera_direction,
            // Preserve Director Brain fields for progression injection
            role: (scene as StoryScene & { role?: SceneRole }).role,
            change_type: (scene as StoryScene & { change_type?: string }).change_type,
            narration_line: (scene as StoryScene & { narration_line?: string }).narration_line,
            is_hero_shot: (scene as StoryScene & { is_hero_shot?: boolean }).is_hero_shot,
          })),
          anchors: workingAnchors,
          // Pass Story Spine for narrative context
          story_spine: storySpine,
          motif_anchors: motifAnchors,
          // Character Continuity Mode settings
          character_continuity_mode: characterContinuityMode,
          locked_provider: lockedProvider,
          // Soft Continuity: allow T2V for energy roles
          soft_continuity: softContinuity,
          // PHASE 8: Force/Escalation settings (MUST PASS to edge function)
          brutality_mode: brutalityMode,
          sanitization_level: sanitizationLevel,
          settings: {
            size: "1280x720", // 16:9 in pixels - must be valid dimension, not aspect ratio
            provider: characterContinuityMode ? lockedProvider : "smart", // Use locked provider or smart routing
            tier, // Pass actual tier for routing decisions
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
      const modeLabel = result.mythMode ? "📜 Myth Mode" : result.filmMode ? "🎬 Film Mode" : "Chained";
      toast({
        title: `${modeLabel} generation started`,
        description: result.mythMode 
          ? `Queued ${result.succeeded}/${result.total} mythic scenes with silhouette style`
          : result.filmMode 
          ? `Queued ${result.succeeded}/${result.total} clips with face-only I2V` 
          : `${result.succeeded}/${result.total} clips completed with frame continuity`,
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
   * 
   * Phase 4: When story_spine exists (AI-generated storyboard), 
   * use minimal enrichment - GPT already crafted rich prompts.
   * Only add continuity context, don't over-engineer.
   */
  async function enrichAllPrompts(
    scenes: StoryScene[],
    continuityContext: string
  ): Promise<EnrichedScene[]> {
    // Phase 4: Check if we have a story spine (AI-generated storyboard)
    const hasNarrativeStructure = !!storySpine;
    
    if (hasNarrativeStructure) {
      // AI already generated rich, poetic prompts with narrative intent
      // Just append minimal continuity context - don't over-engineer
      console.log(`[enrichment] Story has narrative spine - using minimal enrichment`);
      return scenes.map(scene => ({
        ...scene,
        enrichedPrompt: continuityContext 
          ? `${scene.prompt}\n\n${continuityContext}`
          : scene.prompt,
      }));
    }
    
    // Full enrichment for manually-written scenes (no story spine)
    console.log(`[enrichment] No story spine - using full AI enrichment`);
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
            `Duration target: ${getSceneDuration(scene)}s`,
            scene.camera_direction ? `Camera direction: ${scene.camera_direction}` : "",
            // Add previous scene context for continuity
            index > 0 ? `Previous scene: ${getScenePrompt(scenes[index - 1]).substring(0, 100)}...` : "",
          ].filter(Boolean).join("\n");
          
          const scenePrompt = getScenePrompt(scene);
          const { enriched, error } = await enrichPrompt(
            scenePrompt,
            "sora", // Default to sora optimization
            sceneContext
          );
          
          if (error) {
            console.warn(`Failed to enrich scene ${index + 1}:`, error);
            return { ...scene, enrichedPrompt: scenePrompt };
          }
          
          return { ...scene, enrichedPrompt: enriched };
        } catch (err) {
          console.error(`Enrichment error for scene ${index + 1}:`, err);
          return { ...scene, enrichedPrompt: getScenePrompt(scene) };
        }
      })
    );
    
    return enrichedScenes;
  }

  // AI Story Generation - auto-saves to DB immediately
  const generateStory = useMutation({
    mutationFn: async () => {
      if (!concept.trim()) throw new Error("Enter a concept first");
      
      setIsGeneratingStory(true);
      
      // Myth Mode uses the storybook-style generator
      if (mythMode) {
        const { data, error } = await supabase.functions.invoke("create-story-myth-mode", {
          body: {
            account_id: DEFAULT_ACCOUNT_ID,
            premise: concept.trim(),
            scene_count: 3, // Myth mode is always 3-5 scenes
          },
        });
        
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Myth mode generation failed");
        
        // Return in the same format as legacy storyboard
        return {
          title: data.story?.title || `Mythic Tale ${new Date().toLocaleDateString()}`,
          story_spine: data.storyboard?.premise || "",
          motif_anchors: [],
          palette_keywords: data.storyboard?.setting?.palette || [],
          anchors: data.story?.continuity_anchors || getDefaultAnchors(),
          scenes: (data.storyboard?.scenes || []).map((s: { id: string; index: number; visual_description?: string; narration?: string; duration_seconds?: number; beat_type?: string }) => ({
            id: s.id,
            sequence_index: s.index,
            prompt: s.visual_description || s.narration || "",
            duration_target: s.duration_seconds || 7,
            role: s.beat_type === "introduction" ? "hook" : s.beat_type === "moral" ? "cta" : "story_a",
          })),
          myth_mode: true,
          moral: data.storyboard?.moral,
          story_job_id: data.story?.id,
        };
      }
      
      // Film Mode uses the new film-first storyboard generator
      if (filmMode) {
        const { data, error } = await supabase.functions.invoke("create-story-film-mode", {
          body: {
            account_id: DEFAULT_ACCOUNT_ID,
            premise: concept.trim(),
            character_description: anchors.character?.description || "",
            scene_count: STORY_TYPE_CONFIGS[storyType]?.typicalClipCount[1] || 6,
            // PHASE 8: Force/Escalation settings (MUST PASS to edge function)
            brutality_mode: brutalityMode,
            sanitization_level: sanitizationLevel,
          },
        });
        
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || "Film mode generation failed");
        
        // Return in the same format as legacy storyboard
        return {
          title: data.story?.title || `Film Story ${new Date().toLocaleDateString()}`,
          story_spine: data.story?.storyboard_json?.story_spine || "",
          motif_anchors: [],
          palette_keywords: [],
          anchors: data.story?.continuity_anchors || getDefaultAnchors(),
          scenes: data.story?.storyboard_json?.scenes || [],
          film_mode: true,
          story_job_id: data.story?.id,
        };
      }
      
      // Legacy storyboard generation
      const { data, error } = await supabase.functions.invoke("generate-storyboard", {
        body: {
          concept: concept.trim(),
          story_type: storyType,
          tier,
        },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: async (data) => {
      setIsGeneratingStory(false);
      
      // Myth Mode: story already created in DB, just update local state
      if (data.myth_mode && data.story_job_id) {
        const newScenes = (data.scenes || []).map((s: StoryScene, i: number) => ({
          ...s,
          id: s.id || nanoid(8),
          sequence_index: i,
        }));
        
        setTitle(data.title || "");
        setStorySpine(data.story_spine || "");
        setMotifAnchors([]);
        setPaletteKeywords(data.palette_keywords || []);
        setScenes(newScenes);
        setAnchors(data.anchors || getDefaultAnchors());
        setConcept("");
        setStoryType("myth");
        
        queryClient.invalidateQueries({ queryKey: ["story-jobs"] });
        queryClient.invalidateQueries({ queryKey: ["recent-story"] });
        onStoryCreated?.(data.story_job_id);
        
        toast({
          title: "📜 Myth Mode story ready!",
          description: `Created ${newScenes.length} mythic scenes. Moral: "${(data.moral || "").slice(0, 50)}..."`,
        });
        return;
      }
      
      // Film Mode: story already created in DB, just update local state
      if (data.film_mode && data.story_job_id) {
        const newScenes = (data.scenes || []).map((s: StoryScene, i: number) => ({
          ...s,
          id: s.id || nanoid(8),
          sequence_index: i,
        }));
        
        setTitle(data.title || "");
        setStorySpine(data.story_spine || "");
        setMotifAnchors([]);
        setPaletteKeywords([]);
        setScenes(newScenes);
        setAnchors(data.anchors || getDefaultAnchors());
        setConcept("");
        
        queryClient.invalidateQueries({ queryKey: ["story-jobs"] });
        queryClient.invalidateQueries({ queryKey: ["recent-story"] });
        onStoryCreated?.(data.story_job_id);
        
        toast({
          title: "🎬 Film Mode story ready!",
          description: `Created ${newScenes.length} scenes with variety contract. Click Generate to start.`,
        });
        return;
      }
      
      // Legacy: Capture Director Brain output
      const newTitle = data.title || `Story ${new Date().toLocaleDateString()}`;
      const newSpine = data.story_spine || "";
      const newMotifs = data.motif_anchors || [];
      const newPalette = data.palette_keywords || [];
      const newAnchors = data.anchors || getDefaultAnchors();
      
      // Map scenes with ALL Director Brain fields including Story Forces
      const newScenes = (data.scenes || []).map((s: StoryScene & { 
        change_type?: string; 
        narration_line?: string; 
        is_hero_shot?: boolean;
        action_summary?: string;
        cut_type?: "hard" | "continuity";
        force_present?: boolean;
        force_type?: string;
        escalation_delta?: number;
        setpiece_delta?: string;
        state_from?: string;
        state_to?: string;
        alternate_subject?: string;
      }, i: number) => ({
        ...s,
        id: s.id || nanoid(8),
        sequence_index: i,
        // Preserve ALL Director Brain fields
        change_type: s.change_type,
        narration_line: s.narration_line,
        action_summary: s.action_summary, // Critical for progression injection
        role: s.role,
        is_hero_shot: s.is_hero_shot,
        cut_type: s.cut_type, // Critical for T2V vs I2V decision
        // Story Forces (Phase 8) - preserve all escalation fields
        force_present: s.force_present,
        force_type: s.force_type,
        escalation_delta: s.escalation_delta,
        setpiece_delta: s.setpiece_delta,
        state_from: s.state_from,
        state_to: s.state_to,
        alternate_subject: s.alternate_subject,
      }));
      
      // Update local state
      setTitle(newTitle);
      setStorySpine(newSpine);
      setMotifAnchors(newMotifs);
      setPaletteKeywords(newPalette);
      setScenes(newScenes);
      setAnchors(newAnchors);
      setConcept("");
      
      // Build full storyboard with ALL narrative structure
      const fullStoryboard = {
        scenes: newScenes,
        tier,
        story_spine: newSpine,
        motif_anchors: newMotifs,
        palette_keywords: newPalette,
        character_continuity_mode: characterContinuityMode,
        locked_provider: lockedProvider,
        soft_continuity: softContinuity,
        film_mode: filmMode,
        brutality_mode: brutalityMode,
        sanitization_level: sanitizationLevel,
      };
      
      console.log("[StoryBuilder] Saving full storyboard:", {
        story_spine: newSpine,
        scene_count: newScenes.length,
        scene_1_action_summary: newScenes[0]?.action_summary,
        scene_0_cut_type: newScenes[0]?.cut_type,
        scene_1_cut_type: newScenes[1]?.cut_type,
        scene_2_cut_type: newScenes[2]?.cut_type,
      });
      
      // AUTO-SAVE: Create story in DB immediately (don't wait for Generate Clips click)
      if (storyId) {
        // Update existing story
        await supabase
          .from("story_jobs")
          .update({
            title: newTitle,
            storyboard_json: JSON.parse(JSON.stringify(fullStoryboard)),
            continuity_anchors: JSON.parse(JSON.stringify(newAnchors)),
            total_clips: newScenes.length,
          })
          .eq("id", storyId);
        queryClient.invalidateQueries({ queryKey: ["story-job", storyId] });
      } else {
        // Create new story and navigate to it
        const { data: newStory, error: insertError } = await supabase
          .from("story_jobs")
          .insert([{
            account_id: DEFAULT_ACCOUNT_ID,
            title: newTitle,
            story_type: storyType,
            storyboard_json: JSON.parse(JSON.stringify(fullStoryboard)),
            continuity_anchors: JSON.parse(JSON.stringify(newAnchors)),
            total_clips: newScenes.length,
            status: "draft",
          }])
          .select()
          .single();
        
        if (insertError) {
          console.error("[StoryBuilder] Failed to auto-save:", insertError);
        } else if (newStory) {
          queryClient.invalidateQueries({ queryKey: ["story-jobs"] });
          queryClient.invalidateQueries({ queryKey: ["recent-story"] });
          onStoryCreated?.(newStory.id);
        }
      }
      
      toast({
        title: "Story saved!",
        description: `Created ${newScenes.length} scenes with narrative spine. Click Generate to start.`,
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

  // Retry a failed scene clip (with optional AI sanitization)
  const handleRetryScene = async (sceneIndex: number, useAiSanitize: boolean = false) => {
    if (!effectiveStoryId) {
      toast({ title: "No story to retry", variant: "destructive" });
      return;
    }
    
    const scene = scenes[sceneIndex];
    if (!scene) {
      toast({ title: "Scene not found", variant: "destructive" });
      return;
    }
    
    // Get the failed clip for this scene
    const failedClip = storyClips.find(c => c.sequence_index === sceneIndex && c.status === "failed");
    
    let sanitizedPrompt: string | undefined;
    
    // If AI sanitization requested, call the sanitizer first
    if (useAiSanitize) {
      toast({ title: "AI rewriting prompt...", description: "Making it moderation-safe" });
      
      try {
        const { data, error } = await supabase.functions.invoke("sanitize-prompt-ai", {
          body: {
            prompt: getScenePrompt(scene),
            provider: lockedProvider || "sora",
            style: storyType === "myth" ? "myth" : "film",
            error_message: failedClip?.error,
            context: storySpine || undefined,
          },
        });
        
        if (error) throw error;
        
        if (data?.success && data?.sanitized_prompt) {
          sanitizedPrompt = data.sanitized_prompt;
          const changes = data.changes_made?.slice(0, 3).join(", ") || "AI rewrote prompt";
          toast({ 
            title: "Prompt sanitized", 
            description: `Changes: ${changes}`,
          });
          
          // Update the scene with the sanitized prompt
          updateScene(scene.id, { 
            prompt: sanitizedPrompt,
            subject_action: sanitizedPrompt,
          });
        } else {
          throw new Error(data?.error || "AI sanitization failed");
        }
      } catch (err) {
        console.error("AI sanitization failed:", err);
        toast({ 
          title: "AI sanitization failed", 
          description: String(err), 
          variant: "destructive" 
        });
        return;
      }
    }
    
    toast({ title: "Retrying scene...", description: `Re-queueing scene ${sceneIndex + 1}` });
    
    try {
      // Use continue-story-chain to regenerate just this one scene
      // This re-uses the existing story context and picks up from the previous frame if available
      const { data, error } = await supabase.functions.invoke("continue-story-chain", {
        body: {
          story_job_id: effectiveStoryId,
          scene_index: sceneIndex,
          // Pass the failed clip id so it can be marked for replacement
          replace_job_id: failedClip?.id,
          // Pass sanitized prompt override if AI was used
          prompt_override: sanitizedPrompt,
        },
      });
      
      if (error) throw error;
      
      // Check the response for quota/credit errors
      const result = data?.results?.[0];
      if (result?.action === "quota_failed") {
        toast({ 
          title: "Credits exhausted", 
          description: "Video provider has no credits remaining. Try again later.",
          variant: "destructive" 
        });
        return;
      }
      
      if (result?.action === "failed_no_reference") {
        toast({ 
          title: "No reference available", 
          description: "Previous scene must complete first.",
          variant: "destructive" 
        });
        return;
      }
      
      toast({ title: "Scene queued", description: `Scene ${sceneIndex + 1} will regenerate shortly` });
      refetchClips();
    } catch (err) {
      console.error("Retry failed:", err);
      toast({ 
        title: "Retry failed", 
        description: String(err), 
        variant: "destructive" 
      });
    }
  };

  const handleGenerate = async () => {
    if (scenes.length === 0) {
      toast({ title: "Add at least one scene", variant: "destructive" });
      return;
    }

    // Ensure cut_type is present on all scenes
    const scenesWithCutType = ensureCutTypes(scenes);

    // Build full storyboard with Story Spine and Character Continuity Mode preserved
    const fullStoryboard = {
      scenes: scenesWithCutType,
      tier,
      story_spine: storySpine,
      motif_anchors: motifAnchors,
      palette_keywords: paletteKeywords,
      character_continuity_mode: characterContinuityMode,
      locked_provider: lockedProvider,
      soft_continuity: softContinuity,
      brutality_mode: brutalityMode,
      sanitization_level: sanitizationLevel,
    };

    if (storyId) {
      // Update existing story then generate (preserve full narrative structure)
      await supabase
        .from("story_jobs")
        .update({
          storyboard_json: JSON.parse(JSON.stringify(fullStoryboard)),
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
    // Use effectiveStoryId which includes both provided storyId and loaded recent story
    const targetStoryId = effectiveStoryId;
    if (!targetStoryId || storyClips.length === 0) return;
    
    const completedClips = storyClips.filter(c => c.status === "done" && c.output_url);
    if (completedClips.length === 0) {
      toast({ title: "No clips to assemble", description: "Wait for clips to complete", variant: "destructive" });
      return;
    }
    
    setIsAssembling(true);
    
    try {
      // Use story_job_id for story mode assembly (fetches voiceover from story_voiceovers)
      const response = await supabase.functions.invoke("assemble-reel", {
        body: {
          story_job_id: targetStoryId,
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
        // Poll for completion - use story_job_id
        pollAssemblyStatus(targetStoryId);
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

  const config = STORY_TYPE_CONFIGS[storyType] || STORY_TYPE_CONFIGS.short_story;

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
          {/* Per-clip progress breakdown */}
          {isStoryGenerating && (
            <div className="flex gap-1 flex-wrap">
              {Array.from({ length: totalClips }).map((_, idx) => {
                const clip = storyClips.find(c => c.sequence_index === idx);
                const status = clip?.status || "pending";
                const pct = clip?.progress ?? 0;
                
                let bgColor = "bg-muted";
                let textColor = "text-muted-foreground";
                let icon = <Clock className="h-2.5 w-2.5" />;
                
                if (status === "done" || status === "rendered") {
                  bgColor = "bg-success/20";
                  textColor = "text-success";
                  icon = <CheckCircle2 className="h-2.5 w-2.5" />;
                } else if (status === "running" || status === "rendering") {
                  bgColor = "bg-primary/20";
                  textColor = "text-primary";
                  icon = <Loader2 className="h-2.5 w-2.5 animate-spin" />;
                } else if (status === "queued") {
                  bgColor = "bg-warning/20";
                  textColor = "text-warning";
                  icon = <Clock className="h-2.5 w-2.5" />;
                } else if (status === "failed") {
                  bgColor = "bg-destructive/20";
                  textColor = "text-destructive";
                  icon = <XCircle className="h-2.5 w-2.5" />;
                }
                
                return (
                  <Tooltip key={idx}>
                    <TooltipTrigger asChild>
                      <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] ${bgColor} ${textColor}`}>
                        {icon}
                        <span>
                          {status === "done" || status === "rendered" ? "100" : pct}%
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs">
                      Scene {idx + 1}: {status}{clip?.provider ? ` (${clip.provider})` : ""}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
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
                <Select value={tier} onValueChange={(v) => setTier(v as "volume" | "hero")}>
                  <SelectTrigger className="h-8 text-xs w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="volume" className="text-xs">
                      <span className="font-medium">📦 Volume</span>
                    </SelectItem>
                    <SelectItem value="hero" className="text-xs">
                      <span className="font-medium">⭐ Hero</span>
                    </SelectItem>
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
              
              {/* Mode Selection */}
              <div className="pt-2 border-t border-border/50 space-y-3">
                {/* Myth Mode - Storybook/fable style */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="myth-mode"
                      checked={mythMode}
                      onCheckedChange={(checked) => {
                        setMythMode(checked);
                        if (checked) {
                          setFilmMode(false);
                          setCharacterContinuityMode(false);
                          setStoryType("myth");
                        }
                      }}
                    />
                    <Label htmlFor="myth-mode" className="text-xs cursor-pointer font-medium">
                      📜 Myth Mode
                    </Label>
                    <Badge variant="secondary" className="text-[9px] bg-secondary text-secondary-foreground">NEW</Badge>
                  </div>
                </div>
                {mythMode && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed pl-6">
                    Storybook fables: silhouettes, symbolic visuals, no faces. 3 scenes, slow pacing, moral ending.
                  </p>
                )}
                
                {/* Film Mode - NEW film-first architecture */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="film-mode"
                      checked={filmMode}
                      onCheckedChange={(checked) => {
                        setFilmMode(checked);
                        if (checked) {
                          setMythMode(false);
                          setCharacterContinuityMode(false);
                        }
                      }}
                    />
                    <Label htmlFor="film-mode" className="text-xs cursor-pointer font-medium">
                      🎬 Film Mode
                    </Label>
                    <Badge variant="secondary" className="text-[9px] bg-primary/20 text-primary">NEW</Badge>
                  </div>
                </div>
                
                {/* Brutality Mode - reduces sanitization for intense content */}
                {filmMode && (
                  <div className="flex items-center justify-between pl-6">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="brutality-mode"
                        checked={brutalityMode}
                        onCheckedChange={setBrutalityMode}
                      />
                      <Label htmlFor="brutality-mode" className="text-[10px] cursor-pointer text-muted-foreground">
                        Brutality Mode
                      </Label>
                      <Badge variant="outline" className="text-[8px] h-4 bg-destructive/10 text-destructive border-destructive/30">
                        ⚠️ Higher failure risk
                      </Badge>
                    </div>
                  </div>
                )}
                
                {/* Character Continuity Mode - legacy, hidden when Film Mode is on */}
                {!filmMode && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="character-continuity"
                          checked={characterContinuityMode}
                          onCheckedChange={setCharacterContinuityMode}
                        />
                        <Label htmlFor="character-continuity" className="text-xs cursor-pointer">
                          Character Continuity Mode
                        </Label>
                      </div>
                      {characterContinuityMode && (
                        <Select value={lockedProvider} onValueChange={(v) => setLockedProvider(v as "sora" | "runway" | "luma")}>
                          <SelectTrigger className="h-7 text-[10px] w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sora" className="text-xs">
                              <span>🎬 Sora</span>
                            </SelectItem>
                            <SelectItem value="runway" className="text-xs">
                              <span>🚀 Runway</span>
                            </SelectItem>
                            <SelectItem value="luma" className="text-xs">
                              <span>🌙 Luma</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    {characterContinuityMode && (
                      <div className="space-y-2">
                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                          Keeps characters visually consistent across all scenes using a single AI model with I2V chaining.
                        </p>
                        {/* Soft Continuity Toggle - allows T2V for energy roles */}
                        <div className="flex items-center gap-2 pl-6">
                          <Switch
                            id="soft-continuity"
                            checked={softContinuity}
                            onCheckedChange={setSoftContinuity}
                          />
                          <Label htmlFor="soft-continuity" className="text-[10px] cursor-pointer text-muted-foreground">
                            Soft Continuity (allow T2V for hooks/resets)
                          </Label>
                        </div>
                        {softContinuity && (
                          <p className="text-[9px] text-muted-foreground/70 pl-6 leading-relaxed">
                            Injects visual energy by using T2V for hook, problem, reset, and establish roles while keeping I2V for story beats.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Story Overview - The Narrative Arc */}
          {scenes.length > 0 && (
            <Card className="border-l-4 border-l-primary bg-gradient-to-r from-primary/5 to-transparent">
              <CardContent className="p-4 space-y-3">
                {/* Title */}
                <div className="flex items-center gap-3">
                  <Film className="h-5 w-5 text-primary shrink-0" />
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Story title..."
                    className="h-8 text-sm font-semibold flex-1 border-none bg-transparent px-0 focus-visible:ring-0"
                  />
                </div>
                
                {/* Story Spine - The Narrative Arc */}
                {storySpine && (
                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Story Arc
                    </Label>
                    <p className="text-sm text-foreground/90 leading-relaxed italic">
                      "{storySpine}"
                    </p>
                  </div>
                )}
                
                {/* Visual Motifs */}
                {motifAnchors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {motifAnchors.map((motif, i) => (
                      <Badge key={i} variant="outline" className="text-[10px] bg-background/50">
                        🎬 {motif}
                      </Badge>
                    ))}
                  </div>
                )}
                
                {/* Stats */}
                <div className="flex gap-2 pt-1 border-t border-border/50">
                  <Badge variant="secondary" className="text-[10px]">
                    {scenes.length} scenes
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    ~{Math.round(scenes.reduce((sum, s) => sum + (s.duration_target || 5), 0))}s total
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {tier === "hero" ? "⭐ Hero" : "📦 Volume"} tier
                  </Badge>
                </div>
              </CardContent>
            </Card>
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
                    {(() => {
                      // Pre-compute routing for ALL scenes to get accurate soraUsedCount
                      const allRoles = scenes.map((s, i) => 
                        s.role || inferRoleFromPosition(i, scenes.length)
                      );
                      
                      // Compute Sora usage up to each scene by simulating routing
                      let cumulativeSoraCount = 0;
                      const soraUsedAtScene: number[] = [];
                      
                      for (let i = 0; i < scenes.length; i++) {
                        soraUsedAtScene.push(cumulativeSoraCount);
                        // Use the real routing logic with actual tier state
                        const provider = getProviderForRoleWithContext(
                          allRoles[i],
                          tier,
                          cumulativeSoraCount,
                          allRoles
                        );
                        if (provider === "sora") {
                          cumulativeSoraCount++;
                        }
                      }
                      
                      // Build clip status map by sequence_index
                      const clipStatusByIndex = new Map<number, ClipStatus>();
                      storyClips.forEach(clip => {
                        const idx = clip.sequence_index ?? -1;
                        if (idx >= 0) {
                          // Parse moderation telemetry from style_hints
                          let moderationLadder: ClipStatus["moderation_ladder"];
                          try {
                            const hints = clip.style_hints ? JSON.parse(clip.style_hints) : {};
                            if (hints.moderation_ladder) {
                              moderationLadder = hints.moderation_ladder;
                            }
                          } catch { /* ignore parse errors */ }
                          
                          clipStatusByIndex.set(idx, {
                            id: clip.id,
                            status: clip.status,
                            progress: clip.progress,
                            provider: clip.provider,
                            error: clip.error,
                            moderation_ladder: moderationLadder,
                          });
                        }
                      });
                      
                      return scenes.map((scene, index) => (
                        <SortableScene
                          key={scene.id}
                          scene={scene}
                          index={index}
                          totalScenes={scenes.length}
                          defaultDuration={config.defaultDuration}
                          tier={tier}
                          allRoles={allRoles}
                          soraUsedBeforeThis={soraUsedAtScene[index]}
                          clipStatus={clipStatusByIndex.get(index)}
                          onUpdate={(updates) => updateScene(scene.id, updates)}
                          onRemove={() => removeScene(scene.id)}
                          onRetry={handleRetryScene}
                        />
                      ));
                    })()}
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

          {/* Story Analysis Panel - shows narrative/continuity scores */}
          {effectiveStoryId && storyClips.length >= 2 && (
            <StoryAnalysisPanel
              storyId={effectiveStoryId}
              clips={storyClips}
            />
          )}

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

          {/* Voiceover Panel - for myth mode and any story with scenes */}
          {/* Gate on DB storyboard scenes, not local state, so panel shows for loaded stories */}
          {effectiveStoryId && (
            ((existingStory?.storyboard_json as unknown as Storyboard | null)?.scenes?.length ?? scenes.length) > 0
          ) && (mythMode || existingStory?.story_type === "myth") && (
            <StoryNarrationPanel
              storyJobId={effectiveStoryId}
              storyType={existingStory?.story_type || "myth"}
            />
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

interface ClipStatus {
  id: string;
  status: string;
  progress: number | null;
  provider: string;
  error?: string | null;
  /** Moderation telemetry from style_hints */
  moderation_ladder?: {
    stage: number;
    original_provider: string;
    final_provider: string;
    sanitized: boolean;
    fallback_used: boolean;
    style_preserved: boolean;
    dropped_reference?: boolean;
    failure_reason?: string;
  };
}

interface SortableSceneProps {
  scene: StoryScene;
  index: number;
  totalScenes: number;
  defaultDuration: number;
  tier: "volume" | "hero";
  allRoles: (SceneRole | undefined)[];
  soraUsedBeforeThis: number;
  clipStatus?: ClipStatus;
  onUpdate: (updates: Partial<StoryScene>) => void;
  onRemove: () => void;
  onRetry?: (sceneIndex: number, useAiSanitize?: boolean) => void;
}

/** Check if an error is moderation-related */
function isModerationError(error?: string | null): boolean {
  if (!error) return false;
  const lower = error.toLowerCase();
  return [
    "moderation", "content policy", "safety", "blocked", 
    "prohibited", "not allowed", "violates", "harmful", "inappropriate"
  ].some(signal => lower.includes(signal));
}

function SortableScene({ 
  scene, 
  index, 
  totalScenes,
  defaultDuration, 
  tier,
  allRoles,
  soraUsedBeforeThis,
  clipStatus,
  onUpdate, 
  onRemove,
  onRetry,
}: SortableSceneProps) {
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

  // Clip status indicator
  const getStatusBadge = () => {
    if (!clipStatus) return null;
    
    const { status, progress, provider, error } = clipStatus;
    
    if (status === "done" || status === "rendered") {
      const ml = clipStatus.moderation_ladder;
      const wasFallback = ml?.fallback_used;
      const wasSanitized = ml?.sanitized && !wasFallback;
      
      return (
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[9px] h-5 px-1.5 gap-1 bg-success/10 text-success border-success/30">
                <CheckCircle2 className="h-3 w-3" />
                100%
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              Completed via {provider}
              {wasFallback && ` (fallback from ${ml?.original_provider})`}
            </TooltipContent>
          </Tooltip>
          {wasSanitized && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] h-5 px-1.5 bg-warning/10 text-warning border-warning/30">
                  ✨ Sanitized
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Auto-sanitized for moderation</TooltipContent>
            </Tooltip>
          )}
          {wasFallback && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] h-5 px-1.5 bg-accent text-accent-foreground border-border">
                  🔄 Fallback
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Switched {ml?.original_provider} → {ml?.final_provider}
                {ml?.style_preserved && " (style preserved)"}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      );
    }
    
    if (status === "running" || status === "queued" || status === "rendering") {
      const pct = progress ?? (status === "queued" ? 0 : 50);
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[9px] h-5 px-1.5 gap-1 bg-primary/10 text-primary border-primary/30">
              <Loader2 className="h-3 w-3 animate-spin" />
              {pct}%
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {status === "queued" ? "Waiting in queue" : `Rendering via ${provider}`}
          </TooltipContent>
        </Tooltip>
      );
    }
    
    if (status === "failed") {
      const isModBlocked = isModerationError(error);
      return (
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-[9px] h-5 px-1.5 gap-1 bg-destructive/10 text-destructive border-destructive/30">
                <XCircle className="h-3 w-3" />
                {isModBlocked ? "Blocked" : "Failed"}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-[200px]">
              {error || "Generation failed"}
            </TooltipContent>
          </Tooltip>
          {onRetry && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 px-1.5 text-[9px] text-primary hover:bg-primary/10"
                onClick={() => onRetry(index, false)}
              >
                <Play className="h-3 w-3 mr-0.5" />
                Retry
              </Button>
              {isModBlocked && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-[9px] text-warning hover:bg-warning/10"
                      onClick={() => onRetry(index, true)}
                    >
                      <Wand2 className="h-3 w-3 mr-0.5" />
                      AI Fix
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs max-w-[200px]">
                    Use AI to rewrite prompt to pass moderation
                  </TooltipContent>
                </Tooltip>
              )}
            </>
          )}
        </div>
      );
    }
    
    return null;
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
          {/* Role Badge with Provider Indicator */}
          <SceneRoleBadge 
            role={scene.role} 
            sceneIndex={index} 
            totalScenes={totalScenes}
            tier={tier}
            allRoles={allRoles.filter((r): r is SceneRole => r !== undefined)}
            soraUsedBeforeThis={soraUsedBeforeThis}
          />
          {/* Spectacle vs Hero Badge */}
          {isSpectacleScene(scene as unknown as { subject_required?: boolean; alternate_subject?: AlternateSubject }) ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] h-5 px-1.5 bg-accent text-accent-foreground border-border">
                  {(scene as unknown as { alternate_subject?: AlternateSubject }).alternate_subject 
                    ? ALTERNATE_SUBJECT_DISPLAY[(scene as unknown as { alternate_subject: AlternateSubject }).alternate_subject]?.emoji || "🎬"
                    : "🌟"} Spectacle
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                No protagonist needed - pure spectacle/cross-cut
              </TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="text-[9px] h-5 px-1.5 bg-primary/10 text-primary border-primary/30">
                  👤 Hero
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Protagonist appears in this scene
              </TooltipContent>
            </Tooltip>
          )}
          {/* Generation Status Badge */}
          {getStatusBadge()}
          <Textarea
            value={getScenePrompt(scene)}
            onChange={(e) => onUpdate({ prompt: e.target.value, subject_action: e.target.value })}
            placeholder="Scene prompt..."
            className="h-14 text-xs flex-1"
          />
        </div>
        <div className="flex items-center gap-2">
          {/* Role Selector */}
          <Select
            value={scene.role || ""}
            onValueChange={(v) => onUpdate({ role: v as SceneRole })}
          >
            <SelectTrigger className="h-7 text-xs w-24">
              <SelectValue placeholder="Role..." />
            </SelectTrigger>
            <SelectContent>
              {AVAILABLE_ROLES.map(r => (
                <SelectItem key={r.value} value={r.value} className="text-xs">
                  <span className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${r.color}`} />
                    {r.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(getSceneDuration(scene))}
            onValueChange={(v) => onUpdate({ duration_target: Number(v), duration_seconds: Number(v) })}
          >
            <SelectTrigger className="h-7 text-xs w-16">
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
