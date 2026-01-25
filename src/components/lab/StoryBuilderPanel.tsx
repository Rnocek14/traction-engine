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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ContinuityAnchorsEditor } from "./ContinuityAnchorsEditor";
import { ContinuityMonitor } from "./ContinuityMonitor";
import {
  type ContinuityAnchors,
  type StoryType,
  type StoryScene,
  type Storyboard,
  STORY_TYPE_CONFIGS,
} from "@/lib/continuity-scoring";
import { enrichPrompt } from "@/lib/lab-engines";
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
  const [anchors, setAnchors] = useState<ContinuityAnchors>({});
  const [isGenerating, setIsGenerating] = useState(false);
  
  // AI prompt enrichment
  const [autoEnhance, setAutoEnhance] = useState(true);
  const [enrichmentProgress, setEnrichmentProgress] = useState(0);
  const [enrichmentStatus, setEnrichmentStatus] = useState<string | null>(null);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Load existing story if storyId provided
  const { data: existingStory, isLoading: storyLoading } = useQuery({
    queryKey: ["story-job", storyId],
    queryFn: async () => {
      if (!storyId) return null;
      const { data, error } = await supabase
        .from("story_jobs")
        .select("*")
        .eq("id", storyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!storyId,
  });

  // Load clips for existing story
  const { data: storyClips = [] } = useQuery({
    queryKey: ["story-clips", storyId],
    queryFn: async () => {
      if (!storyId) return [];
      const { data, error } = await supabase
        .from("video_jobs")
        .select("*")
        .eq("story_job_id", storyId)
        .order("sequence_index", { ascending: true });
      if (error) throw error;
      return data as VideoJob[];
    },
    enabled: !!storyId,
    refetchInterval: storyId ? 5000 : false,
  });

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

  // Generate all clips mutation
  const generateAllClips = useMutation({
    mutationFn: async (targetStoryId: string) => {
      setIsGenerating(true);
      setEnrichmentProgress(0);
      setEnrichmentStatus(null);
      
      // Update story status
      await supabase
        .from("story_jobs")
        .update({ status: "generating" })
        .eq("id", targetStoryId);

      // Build continuity context for enrichment
      const continuityContext = buildContinuityContext(anchors);
      
      // If auto-enhance is enabled, enrich all prompts first
      let enrichedScenes: EnrichedScene[] = scenes.map(s => ({ ...s }));
      if (autoEnhance) {
        setEnrichmentStatus("Enhancing prompts with AI...");
        enrichedScenes = await enrichAllPrompts(scenes, continuityContext);
        setEnrichmentProgress(50);
      }

      setEnrichmentStatus("Queuing video generation...");
      
      // Queue each scene as a clip with enriched prompts
      const results = await Promise.all(
        enrichedScenes.map(async (enrichedScene, index) => {
          const { data, error } = await supabase.functions.invoke("lab-queue-video", {
            body: {
              provider: "auto", // Let backend decide based on routing
              prompt: enrichedScene.enrichedPrompt || enrichedScene.prompt, // Use enriched if available
              original_prompt: enrichedScene.prompt, // Always track original for analysis
              settings: {
                size: "16:9",
                duration: enrichedScene.duration_target,
              },
              story_job_id: targetStoryId,
              sequence_index: index,
              camera_direction: enrichedScene.camera_direction,
              style_hints: JSON.stringify(anchors),
            },
          });
          
          // Update progress
          setEnrichmentProgress(50 + Math.round(((index + 1) / enrichedScenes.length) * 50));
          
          if (error) return { error, scene: enrichedScene };
          return { jobId: data?.job?.id, scene: enrichedScene };
        })
      );

      const succeeded = results.filter(r => !r.error).length;
      const failed = results.filter(r => r.error).length;
      
      setEnrichmentStatus(null);
      setEnrichmentProgress(100);

      return { succeeded, failed, total: scenes.length };
    },
    onSuccess: (result) => {
      setIsGenerating(false);
      setEnrichmentProgress(0);
      toast({
        title: "Generation started",
        description: `${result.succeeded}/${result.total} clips queued${autoEnhance ? " (AI-enhanced)" : ""}`,
      });
      queryClient.invalidateQueries({ queryKey: ["story-clips", storyId] });
    },
    onError: () => {
      setIsGenerating(false);
      setEnrichmentProgress(0);
      setEnrichmentStatus(null);
      toast({ title: "Generation failed", variant: "destructive" });
    },
  });

  /**
   * Build continuity context from anchors for prompt enrichment
   */
  function buildContinuityContext(anchors: ContinuityAnchors): string {
    const parts: string[] = [];
    
    if (anchors.character?.description) {
      parts.push(`CHARACTER: ${anchors.character.description}`);
      if (anchors.character.wardrobe) {
        parts.push(`WARDROBE: ${anchors.character.wardrobe}`);
      }
    }
    if (anchors.environment?.location) {
      parts.push(`LOCATION: ${anchors.environment.location}`);
      if (anchors.environment.time_of_day) {
        parts.push(`TIME: ${anchors.environment.time_of_day}`);
      }
    }
    if (anchors.camera_language?.movement_style) {
      parts.push(`CAMERA STYLE: ${anchors.camera_language.movement_style}`);
      if (anchors.camera_language.lens) {
        parts.push(`LENS: ${anchors.camera_language.lens}`);
      }
    }
    if (anchors.negative_list && anchors.negative_list.length > 0) {
      parts.push(`AVOID: ${anchors.negative_list.join(", ")}`);
    }
    
    return parts.join("\n");
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
          // Include scene context in style hints
          const sceneContext = [
            continuityContext,
            `SCENE ${index + 1}/${scenes.length}`,
            scene.camera_direction ? `CAMERA: ${scene.camera_direction}` : "",
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

  const config = STORY_TYPE_CONFIGS[storyType];

  if (storyLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Header */}
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
              <Badge variant="outline" className="text-[10px]">
                {config.clipPacing} cuts
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {config.continuityStrictness}
              </Badge>
            </div>
          </div>

          {/* Continuity Anchors */}
          <Collapsible defaultOpen>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="py-2 px-3 cursor-pointer hover:bg-accent/50 transition-colors">
                  <CardTitle className="text-xs font-medium flex items-center gap-2">
                    <Wand2 className="h-3.5 w-3.5" />
                    Continuity Anchors
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
                <button
                  onClick={addScene}
                  className="w-full py-6 border-2 border-dashed rounded-lg text-center text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
                >
                  <Plus className="h-5 w-5 mx-auto mb-1" />
                  Add your first scene
                </button>
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
            AI will refine each scene prompt with cinematic details before generation
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
