/**
 * Stories - Unified workspace for story management
 * 
 * Layout:
 * - Left: Story Library (browse/select)
 * - Right: Story Studio (edit in-place, no navigation away)
 * 
 * Clicking a story loads it in place. User never loses context.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Film, Plus, Loader2, Sparkles, Settings2, PackageCheck } from "lucide-react";
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
import { GlobalNav } from "@/components/GlobalNav";
import { SceneList } from "@/components/story-studio/SceneList";
import { SceneInspector } from "@/components/story-studio/SceneInspector";
import { StudioPreview } from "@/components/story-studio/StudioPreview";
import { StorySettings } from "@/components/story-studio/StorySettings";
import { StoryCreationWizard } from "@/components/lab/StoryCreationWizard";

// Types
import type { StoryScene, ContinuityAnchors, Storyboard } from "@/lib/continuity-scoring";
import { useStoryVoiceover } from "@/hooks/use-story-voiceover";
import { useReelAssembly } from "@/hooks/use-reel-assembly";

type StoryJob = Tables<"story_jobs">;
type VideoJob = Tables<"video_jobs">;

export default function Stories() {
  const { storyId } = useParams<{ storyId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mode: "library" (browsing) | "editor" (story selected) | "create" (new story wizard)
  const [mode, setMode] = useState<"library" | "editor" | "create">(
    storyId ? "editor" : "library"
  );
  
  // Selected scene for inspector (when in editor mode)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Sync mode with URL
  useEffect(() => {
    if (storyId) {
      setMode("editor");
    }
  }, [storyId]);

  // Handle story selection from library
  const handleSelectStory = (id: string) => {
    navigate(`/produce/${id}`, { replace: true });
    setMode("editor");
  };

  // Handle new story creation
  const handleNewStory = () => {
    setMode("create");
    navigate("/produce", { replace: true });
  };

  // Handle story created
  const handleStoryCreated = (newStoryId: string) => {
    navigate(`/produce/${newStoryId}`, { replace: true });
    setMode("editor");
  };

  // Back to library
  const handleBackToLibrary = () => {
    setMode("library");
    navigate("/produce", { replace: true });
    setSelectedSceneId(null);
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <GlobalNav />

      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Left: Story Library - always visible */}
          <ResizablePanel defaultSize={22} minSize={18} maxSize={35}>
            <StoryLibraryPanel
              activeStoryId={storyId}
              onSelectStory={handleSelectStory}
              onNewStory={handleNewStory}
              mode={mode}
            />
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-border/50" />

          {/* Right: Story Workspace or Empty State */}
          <ResizablePanel defaultSize={78} minSize={50}>
            {mode === "create" ? (
              <div className="h-full overflow-y-auto">
                <StoryCreationWizard onStoryCreated={handleStoryCreated} />
              </div>
            ) : storyId ? (
              <StoryEditor
                storyId={storyId}
                selectedSceneId={selectedSceneId}
                setSelectedSceneId={setSelectedSceneId}
                showSettings={showSettings}
                setShowSettings={setShowSettings}
              />
            ) : (
              <EmptyState onNewStory={handleNewStory} />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

/**
 * Story Library Panel - Left sidebar
 */
interface StoryLibraryPanelProps {
  activeStoryId?: string;
  onSelectStory: (id: string) => void;
  onNewStory: () => void;
  mode: "library" | "editor" | "create";
}

function StoryLibraryPanel({
  activeStoryId,
  onSelectStory,
  onNewStory,
  mode,
}: StoryLibraryPanelProps) {
  const [showArchived, setShowArchived] = useState(false);

  // Fetch stories
  const { data: stories, isLoading } = useQuery({
    queryKey: ["stories-list", showArchived],
    queryFn: async () => {
      let query = supabase
        .from("story_jobs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!showArchived) {
        query = query.neq("status", "archived");
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as StoryJob[];
    },
    refetchInterval: 10000,
  });

  // Fetch clip counts
  const storyIds = stories?.map((s) => s.id) || [];
  const { data: clipCounts } = useQuery({
    queryKey: ["story-clip-counts", storyIds.join(",")],
    queryFn: async () => {
      if (!storyIds.length) return new Map<string, { done: number; total: number }>();
      const { data, error } = await supabase
        .from("video_jobs")
        .select("story_job_id, status")
        .in("story_job_id", storyIds);
      if (error) throw error;

      const counts = new Map<string, { done: number; total: number }>();
      for (const clip of data || []) {
        const id = clip.story_job_id!;
        const existing = counts.get(id) || { done: 0, total: 0 };
        existing.total++;
        if (clip.status === "done") existing.done++;
        counts.set(id, existing);
      }
      return counts;
    },
    enabled: storyIds.length > 0,
    refetchInterval: 5000,
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-full flex flex-col border-r">
      {/* Header */}
      <div className="px-3 py-3 border-b bg-card/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Film className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Stories</span>
          {stories && (
            <Badge variant="secondary" className="text-[10px]">
              {stories.length}
            </Badge>
          )}
        </div>
        <Button
          size="sm"
          className="h-7 gap-1"
          onClick={onNewStory}
        >
          <Plus className="h-3 w-3" />
          <span className="text-xs">New</span>
        </Button>
      </div>

      {/* Story List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
            Loading stories...
          </div>
        ) : !stories?.length ? (
          <div className="p-6 text-center">
            <Film className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-3">
              No stories yet
            </p>
            <Button size="sm" onClick={onNewStory}>
              <Plus className="h-3 w-3 mr-1" />
              Create your first story
            </Button>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {stories.map((story) => {
              const counts = clipCounts?.get(story.id);
              const isActive = activeStoryId === story.id;

              return (
                <button
                  key={story.id}
                  onClick={() => onSelectStory(story.id)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-lg transition-all",
                    isActive
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-muted/50 border border-transparent"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium truncate">
                      {story.title || "Untitled Story"}
                    </span>
                    {counts && (
                      <Badge
                        variant={counts.done === counts.total ? "default" : "secondary"}
                        className="text-[9px] ml-2"
                      >
                        {counts.done}/{counts.total}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{formatDate(story.created_at)}</span>
                    <span>•</span>
                    <span className="capitalize">{story.story_type}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer - show/hide archived toggle */}
      <div className="px-3 py-2 border-t text-center">
        <Button
          variant="ghost"
          size="sm"
          className="text-[11px] text-muted-foreground"
          onClick={() => setShowArchived(!showArchived)}
        >
          {showArchived ? "Hide archived" : "Show archived"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Empty State - when no story is selected
 */
function EmptyState({ onNewStory }: { onNewStory: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Film className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Select a Story</h2>
        <p className="text-muted-foreground text-sm mb-6">
          Choose a story from the library to start editing, or create a new one.
        </p>
        <Button onClick={onNewStory} className="gap-2">
          <Plus className="h-4 w-4" />
          Create New Story
        </Button>
      </div>
    </div>
  );
}

/**
 * Story Editor - Right side when a story is selected
 */
interface StoryEditorProps {
  storyId: string;
  selectedSceneId: string | null;
  setSelectedSceneId: (id: string | null) => void;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
}

export function StoryEditor({
  storyId,
  selectedSceneId,
  setSelectedSceneId,
  showSettings,
  setShowSettings,
}: StoryEditorProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load story
  const { data: story, isLoading: storyLoading } = useQuery({
    queryKey: ["story-job", storyId],
    queryFn: async () => {
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

  // Deduplicate clips per scene
  const clipsBySceneId = useMemo(() => {
    const map = new Map<string, VideoJob>();
    for (const clip of clips) {
      const sceneId = clip.scene_id || String(clip.sequence_index);
      const existing = map.get(sceneId);

      if (!existing) {
        map.set(sceneId, clip);
        continue;
      }

      if (clip.is_primary && !existing.is_primary) {
        map.set(sceneId, clip);
        continue;
      }

      const statusPriority = (s: string) =>
        s === "done" ? 3 : s === "running" || s === "queued" ? 2 : 1;
      if (statusPriority(clip.status) > statusPriority(existing.status)) {
        map.set(sceneId, clip);
      }
    }
    return map;
  }, [clips]);

  // All clips for a scene (for alternates)
  const allClipsForScene = useCallback(
    (sceneId: string) => {
      return clips.filter(
        (c) => c.scene_id === sceneId || String(c.sequence_index) === sceneId
      );
    },
    [clips]
  );

  // Selected scene data
  const selectedScene = useMemo(() => {
    if (!selectedSceneId) return null;
    return scenes.find((s) => s.id === selectedSceneId) || null;
  }, [selectedSceneId, scenes]);

  const selectedSceneIndex = useMemo(() => {
    if (!selectedSceneId) return -1;
    return scenes.findIndex((s) => s.id === selectedSceneId);
  }, [selectedSceneId, scenes]);

  // Auto-select first scene
  useEffect(() => {
    if (scenes.length > 0 && !selectedSceneId) {
      setSelectedSceneId(scenes[0].id);
    }
  }, [scenes, selectedSceneId, setSelectedSceneId]);

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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [storyId, refetchClips]);

  // Trigger processing for active jobs
  useEffect(() => {
    const activeJobs = clips.filter(
      (c) => c.status === "running" || c.status === "queued"
    );
    if (activeJobs.length === 0) return;

    const providers = new Set(activeJobs.map((j) => j.provider));
    const triggerProcessing = async () => {
      const calls = [];
      if (providers.has("sora"))
        calls.push(supabase.functions.invoke("process-video", { body: {} }));
      if (providers.has("runway"))
        calls.push(supabase.functions.invoke("process-video-runway", { body: {} }));
      if (providers.has("luma"))
        calls.push(supabase.functions.invoke("process-video-luma", { body: {} }));
      await Promise.allSettled(calls);
    };
    triggerProcessing();
    const interval = setInterval(triggerProcessing, 5000);
    return () => clearInterval(interval);
  }, [clips]);

  // Update scene in storyboard
  const updateScene = useCallback(
    async (sceneId: string, updates: Partial<StoryScene>) => {
      if (!story || !storyboard) return;

      const updatedScenes = storyboard.scenes.map((s) =>
        s.id === sceneId ? { ...s, ...updates } : s
      );

      const updatedStoryboard = { ...storyboard, scenes: updatedScenes };

      await supabase
        .from("story_jobs")
        .update({ storyboard_json: JSON.parse(JSON.stringify(updatedStoryboard)) })
        .eq("id", story.id);

      queryClient.invalidateQueries({ queryKey: ["story-job", storyId] });
    },
    [story, storyboard, storyId, queryClient]
  );

  // Set primary clip
  const setPrimaryClip = useCallback(
    async (clipId: string, sceneId: string) => {
      await supabase
        .from("video_jobs")
        .update({ is_primary: false })
        .eq("story_job_id", storyId)
        .eq("scene_id", sceneId)
        .neq("id", clipId);

      await supabase.from("video_jobs").update({ is_primary: true }).eq("id", clipId);

      refetchClips();
      toast({ title: "Primary clip updated" });
    },
    [storyId, refetchClips, toast]
  );

  // Regenerate scene
  const regenerateScene = useCallback(
    async (sceneIndex: number) => {
      toast({ title: "Regenerating scene...", description: `Scene ${sceneIndex + 1}` });

      const { error } = await supabase.functions.invoke("continue-story-chain", {
        body: {
          story_job_id: storyId,
          scene_index: sceneIndex,
          force_regenerate: true,
        },
      });

      if (error) {
        toast({
          title: "Regeneration failed",
          description: String(error),
          variant: "destructive",
        });
      } else {
        toast({ title: "Scene queued for regeneration" });
        refetchClips();
      }
    },
    [storyId, toast, refetchClips]
  );

  // Generate all scenes
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const generateAllScenes = useCallback(async () => {
    if (!story) return;

    setIsGeneratingAll(true);
    toast({ title: "Starting generation...", description: "Queueing all scenes" });

    try {
      const functionName =
        story.story_type === "myth"
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
        description: `${queued} scenes queued for generation`,
      });

      refetchClips();
    } catch (err) {
      toast({
        title: "Generation failed",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setIsGeneratingAll(false);
    }
  }, [storyId, story, toast, refetchClips]);

  // Progress stats
  const stats = useMemo(() => {
    const total = scenes.length;
    const done = clips.filter((c) => c.status === "done" && c.is_primary).length;
    const running = clips.filter(
      (c) => c.status === "running" || c.status === "queued"
    ).length;
    return { total, done, running };
  }, [scenes.length, clips]);

  // Loading state
  if (storyLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not found
  if (!story) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <Film className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Story not found</h1>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Story Header */}
      <header className="h-12 flex-shrink-0 border-b bg-card/50 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Film className="h-4 w-4 text-primary" />
          <h1 className="text-sm font-semibold truncate max-w-[200px]">
            {story.title || "Untitled Story"}
          </h1>
          <Badge variant="secondary" className="text-[10px]">
            {story.story_type}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
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

      {/* 3-column layout */}
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
        {/* Left: Scene List */}
        <ResizablePanel defaultSize={25} minSize={18} maxSize={35}>
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
        <ResizablePanel defaultSize={45} minSize={30}>
          <StudioPreview
            clips={clips}
            scenes={scenes}
            voiceover={activeVoiceover}
            storyId={storyId}
            clipsBySceneId={clipsBySceneId}
          />
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
