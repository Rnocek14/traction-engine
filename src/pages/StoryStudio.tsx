/**
 * StoryStudio - Dedicated 3-column scene-first story editor
 * 
 * Replaces Lab's embedded Story Builder with a production-focused editor.
 * 
 * Layout:
 * - Left: Scene List (compact, drag-drop, status chips)
 * - Center: Unified Preview (audio-master sync)
 * - Right: Scene Inspector (prompts, provider, alternates)
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Film,
  ArrowLeft,
  Plus,
  Play,
  Loader2,
  Settings2,
  Sparkles,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

// Components
import { SceneList } from "@/components/story-studio/SceneList";
import { SceneInspector } from "@/components/story-studio/SceneInspector";
import { StudioPreview } from "@/components/story-studio/StudioPreview";
import { StorySettings } from "@/components/story-studio/StorySettings";

// Types
import type { StoryScene, ContinuityAnchors, Storyboard } from "@/lib/continuity-scoring";
import { useStoryVoiceover } from "@/hooks/use-story-voiceover";

type StoryJob = Tables<"story_jobs">;
type VideoJob = Tables<"video_jobs">;

const DEFAULT_ACCOUNT_ID = "lab_sandbox";

export default function StoryStudio() {
  const { storyId } = useParams<{ storyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Selected scene for inspector
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Load story
  const { data: story, isLoading: storyLoading } = useQuery({
    queryKey: ["story-job", storyId],
    queryFn: async () => {
      if (!storyId) return null;
      const { data, error } = await supabase
        .from("story_jobs")
        .select("*")
        .eq("id", storyId)
        .maybeSingle();
      if (error) throw error;
      return data as StoryJob | null;
    },
    enabled: !!storyId,
  });

  // Load clips for story
  const { data: clips = [], refetch: refetchClips } = useQuery({
    queryKey: ["story-clips", storyId],
    queryFn: async () => {
      if (!storyId) return [];
      const { data, error } = await supabase
        .from("video_jobs")
        .select("*")
        .eq("story_job_id", storyId)
        .order("sequence_index", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as VideoJob[];
    },
    enabled: !!storyId,
    refetchInterval: 5000,
  });

  // Active voiceover
  const { data: activeVoiceover } = useStoryVoiceover(storyId);

  // Parse storyboard
  const storyboard = useMemo(() => {
    if (!story?.storyboard_json) return null;
    return story.storyboard_json as unknown as Storyboard & {
      tier?: "volume" | "hero";
      character_continuity_mode?: boolean;
      locked_provider?: "sora" | "runway" | "luma";
    };
  }, [story?.storyboard_json]);

  const scenes = storyboard?.scenes || [];
  const anchors = (story?.continuity_anchors as unknown as ContinuityAnchors) || {};

  // Deduplicate clips per scene - keep primary or best status
  // Match by scene_id first, then fall back to sequence_index → scene position
  const clipsBySceneId = useMemo(() => {
    const map = new Map<string, VideoJob>();
    
    // Build index: sequence_index → scene.id for fallback matching
    const seqToSceneId = new Map<number, string>();
    scenes.forEach((s, i) => seqToSceneId.set(i, s.id));
    
    for (const clip of clips) {
      // Determine which scene this clip belongs to
      const sceneId = clip.scene_id || seqToSceneId.get(clip.sequence_index ?? -1) || String(clip.sequence_index);
      const existing = map.get(sceneId);
      
      if (!existing) {
        map.set(sceneId, clip);
        continue;
      }
      
      // Prefer is_primary
      if (clip.is_primary && !existing.is_primary) {
        map.set(sceneId, clip);
        continue;
      }
      
      // Otherwise prefer done > running > failed
      const statusPriority = (s: string) => 
        s === "done" ? 3 : s === "running" || s === "queued" ? 2 : 1;
      if (statusPriority(clip.status) > statusPriority(existing.status)) {
        map.set(sceneId, clip);
      }
    }
    return map;
  }, [clips, scenes]);

  // All clips for a scene (for alternates)
  const allClipsForScene = useCallback((sceneId: string) => {
    const sceneIndex = scenes.findIndex(s => s.id === sceneId);
    return clips.filter(c => 
      c.scene_id === sceneId || 
      (sceneIndex >= 0 && c.sequence_index === sceneIndex)
    );
  }, [clips, scenes]);

  // Selected scene data
  const selectedScene = useMemo(() => {
    if (!selectedSceneId) return null;
    return scenes.find(s => s.id === selectedSceneId) || null;
  }, [selectedSceneId, scenes]);

  const selectedSceneIndex = useMemo(() => {
    if (!selectedSceneId) return -1;
    return scenes.findIndex(s => s.id === selectedSceneId);
  }, [selectedSceneId, scenes]);

  // Auto-select first scene
  useEffect(() => {
    if (scenes.length > 0 && !selectedSceneId) {
      setSelectedSceneId(scenes[0].id);
    }
  }, [scenes, selectedSceneId]);

  // Real-time subscription for clip updates
  useEffect(() => {
    if (!storyId) return;
    const channel = supabase
      .channel(`story-clips-${storyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "video_jobs",
          filter: `story_job_id=eq.${storyId}`,
        },
        () => refetchClips()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storyId, refetchClips]);

  // Trigger processing for active jobs
  useEffect(() => {
    const activeJobs = clips.filter(c => c.status === "running" || c.status === "queued");
    if (activeJobs.length === 0) return;

    const providers = new Set(activeJobs.map(j => j.provider));
    const triggerProcessing = async () => {
      const calls = [];
      if (providers.has("sora")) calls.push(supabase.functions.invoke("process-video", { body: {} }));
      if (providers.has("runway")) calls.push(supabase.functions.invoke("process-video-runway", { body: {} }));
      if (providers.has("luma")) calls.push(supabase.functions.invoke("process-video-luma", { body: {} }));
      await Promise.allSettled(calls);
    };
    triggerProcessing();
    const interval = setInterval(triggerProcessing, 5000);
    return () => clearInterval(interval);
  }, [clips]);

  // Update scene in storyboard
  const updateScene = useCallback(async (sceneId: string, updates: Partial<StoryScene>) => {
    if (!story || !storyboard) return;
    
    const updatedScenes = storyboard.scenes.map(s =>
      s.id === sceneId ? { ...s, ...updates } : s
    );
    
    const updatedStoryboard = { ...storyboard, scenes: updatedScenes };
    
    await supabase
      .from("story_jobs")
      .update({ storyboard_json: JSON.parse(JSON.stringify(updatedStoryboard)) })
      .eq("id", story.id);
    
    queryClient.invalidateQueries({ queryKey: ["story-job", storyId] });
  }, [story, storyboard, storyId, queryClient]);

  // Set primary clip
  const setPrimaryClip = useCallback(async (clipId: string, sceneId: string) => {
    // Unset all other primaries for this scene
    await supabase
      .from("video_jobs")
      .update({ is_primary: false })
      .eq("story_job_id", storyId)
      .eq("scene_id", sceneId)
      .neq("id", clipId);
    
    // Set new primary
    await supabase
      .from("video_jobs")
      .update({ is_primary: true })
      .eq("id", clipId);
    
    refetchClips();
    toast({ title: "Primary clip updated" });
  }, [storyId, refetchClips, toast]);

  // Regenerate scene
  const regenerateScene = useCallback(async (sceneIndex: number) => {
    if (!storyId) return;
    
    toast({ title: "Regenerating scene...", description: `Scene ${sceneIndex + 1}` });
    
    const { error } = await supabase.functions.invoke("continue-story-chain", {
      body: {
        story_job_id: storyId,
        scene_index: sceneIndex,
        force_regenerate: true,
      },
    });
    
    if (error) {
      toast({ title: "Regeneration failed", description: String(error), variant: "destructive" });
    } else {
      toast({ title: "Scene queued for regeneration" });
      refetchClips();
    }
  }, [storyId, toast, refetchClips]);

  // Generate all scenes
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const generateAllScenes = useCallback(async () => {
    if (!storyId || !story) return;
    
    setIsGeneratingAll(true);
    toast({ title: "Starting generation...", description: "Queueing all scenes" });

    try {
      // Determine which edge function to call based on story type
      const functionName = story.story_type === "myth" 
        ? "continue-story-myth-mode"
        : story.story_type === "film_continuity"
        ? "continue-story-film-mode"
        : "continue-story-chain";

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { story_job_id: storyId },
      });

      if (error) throw error;
      
      const queued = data?.summary?.queued || 0;
      toast({ 
        title: "Generation started!", 
        description: `${queued} scenes queued for generation` 
      });
      
      refetchClips();
    } catch (err) {
      toast({ 
        title: "Generation failed", 
        description: String(err), 
        variant: "destructive" 
      });
    } finally {
      setIsGeneratingAll(false);
    }
  }, [storyId, story, toast, refetchClips]);

  // Progress stats — count unique scenes with done clips (not just is_primary)
  const stats = useMemo(() => {
    const total = scenes.length;
    const doneSceneIds = new Set<string>();
    for (const clip of clips) {
      if (clip.status === "done") {
        const key = clip.scene_id || String(clip.sequence_index);
        doneSceneIds.add(key);
      }
    }
    const done = doneSceneIds.size;
    const running = clips.filter(c => c.status === "running" || c.status === "queued").length;
    return { total, done, running };
  }, [scenes.length, clips]);

  // Loading state
  if (storyLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not found
  if (!story) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background gap-4">
        <Film className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Story not found</h1>
        <Button asChild>
          <Link to="/stories">Back to Stories</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="h-12 flex-shrink-0 border-b bg-card/50 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link to="/stories">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <Film className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold truncate max-w-[200px]">
            {story.title || "Untitled Story"}
          </h1>
          <Badge variant="secondary" className="text-[10px]">
            {story.story_type}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Generate All button - show when no clips are generating */}
          {stats.running === 0 && stats.done < stats.total && (
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={generateAllScenes}
              disabled={isGeneratingAll}
            >
              {isGeneratingAll ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Generate All
            </Button>
          )}
          {stats.running > 0 && (
            <Badge variant="default" className="text-[10px] bg-primary/80 animate-pulse">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              {stats.running} generating
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {stats.done}/{stats.total} scenes
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </header>

      {/* Main 3-column layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Left: Scene List */}
        <ResizablePanel defaultSize={22} minSize={18} maxSize={35}>
          <div className="h-full flex flex-col border-r">
            <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
              <span className="text-xs font-medium">Scenes</span>
              <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
            <ScrollArea className="flex-1">
              <SceneList
                scenes={scenes}
                clipsBySceneId={clipsBySceneId}
                selectedSceneId={selectedSceneId}
                onSelectScene={setSelectedSceneId}
                storyType={story.story_type}
              />
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border/50" />

        {/* Center: Preview */}
        <ResizablePanel defaultSize={48} minSize={35}>
          <div className="h-full flex flex-col">
            <StudioPreview
              clips={clips}
              scenes={scenes}
              voiceover={activeVoiceover}
              storyId={storyId || ""}
              clipsBySceneId={clipsBySceneId}
            />
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-border/50" />

        {/* Right: Inspector */}
        <ResizablePanel defaultSize={30} minSize={22} maxSize={40}>
          <div className="h-full border-l">
            {showSettings ? (
              <StorySettings
                story={story}
                storyboard={storyboard}
                onClose={() => setShowSettings(false)}
              />
            ) : selectedScene ? (
              <SceneInspector
                scene={selectedScene}
                sceneIndex={selectedSceneIndex}
                clip={clipsBySceneId.get(selectedScene.id)}
                allClips={allClipsForScene(selectedScene.id)}
                onUpdateScene={(updates) => updateScene(selectedScene.id, updates)}
                onSetPrimary={(clipId) => setPrimaryClip(clipId, selectedScene.id)}
                onRegenerate={() => regenerateScene(selectedSceneIndex)}
                storyType={story.story_type}
                anchors={anchors}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Select a scene to inspect
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
