/**
 * Produce - Unified production workspace
 * 
 * Merges Stories + Scripts + Rendition Studio into one workspace.
 * Left: Library sidebar (stories + scripts, filterable)
 * Right: Context-sensitive editor
 */

import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Film,
  FileText,
  Plus,
  Loader2,
  Clapperboard,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";

// Components
import { GlobalNav } from "@/components/GlobalNav";
import { StoryCreationWizard } from "@/components/lab/StoryCreationWizard";

// Story Editor Components
import { SceneList } from "@/components/story-studio/SceneList";
import { SceneInspector } from "@/components/story-studio/SceneInspector";
import { StudioPreview } from "@/components/story-studio/StudioPreview";
import { StorySettings } from "@/components/story-studio/StorySettings";
import { useStoryVoiceover } from "@/hooks/use-story-voiceover";
import type { StoryScene, ContinuityAnchors, Storyboard } from "@/lib/continuity-scoring";

type StoryJob = Tables<"story_jobs">;
type LibraryFilter = "all" | "stories" | "scripts";
type ProduceMode = "empty" | "story" | "script" | "create-story" | "create-script";

export default function Produce() {
  const { storyId } = useParams<{ storyId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<LibraryFilter>("all");
  const [mode, setMode] = useState<ProduceMode>(storyId ? "story" : "empty");

  useEffect(() => {
    if (storyId) setMode("story");
  }, [storyId]);

  const { data: stories = [], isLoading: storiesLoading } = useQuery({
    queryKey: ["produce-stories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("story_jobs")
        .select("*")
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as StoryJob[];
    },
    refetchInterval: 10000,
  });

  const { data: scripts = [], isLoading: scriptsLoading } = useQuery({
    queryKey: ["produce-scripts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("script_runs")
        .select("id, account_id, status, created_at, script_content")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 15000,
  });

  const storyIds = stories.map((s) => s.id);
  const { data: clipCounts } = useQuery({
    queryKey: ["produce-clip-counts", storyIds.join(",")],
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

  const handleSelectStory = (id: string) => {
    navigate(`/produce/${id}`, { replace: true });
    setMode("story");
  };

  const handleSelectScript = (id: string) => {
    navigate(`/produce?script=${id}`, { replace: true });
    setMode("script");
  };

  const handleNewStory = () => {
    setMode("create-story");
    navigate("/produce", { replace: true });
  };

  const handleNewScript = () => {
    setMode("create-script");
    navigate("/produce", { replace: true });
  };

  const handleStoryCreated = (newId: string) => {
    navigate(`/produce/${newId}`, { replace: true });
    setMode("story");
  };

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

  const selectedScriptId = searchParams.get("script");
  const isLoading = storiesLoading || scriptsLoading;
  const showStories = filter === "all" || filter === "stories";
  const showScripts = filter === "all" || filter === "scripts";

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <GlobalNav />
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={22} minSize={18} maxSize={35}>
            <div className="h-full flex flex-col border-r">
              <div className="px-3 py-3 border-b bg-card/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clapperboard className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Library</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" className="h-7 gap-1">
                      <Plus className="h-3 w-3" />
                      <span className="text-xs">New</span>
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleNewStory}>
                      <Film className="h-4 w-4 mr-2" />
                      New Story
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleNewScript}>
                      <FileText className="h-4 w-4 mr-2" />
                      New Script
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="px-2 py-2 border-b">
                <Tabs value={filter} onValueChange={(v) => setFilter(v as LibraryFilter)}>
                  <TabsList className="w-full h-8">
                    <TabsTrigger value="all" className="text-xs flex-1">All</TabsTrigger>
                    <TabsTrigger value="stories" className="text-xs flex-1">Stories ({stories.length})</TabsTrigger>
                    <TabsTrigger value="scripts" className="text-xs flex-1">Scripts ({scripts.length})</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <ScrollArea className="flex-1">
                {isLoading ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                    Loading...
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {showStories && stories.map((story) => {
                      const counts = clipCounts?.get(story.id);
                      const isActive = storyId === story.id;
                      return (
                        <button
                          key={story.id}
                          onClick={() => handleSelectStory(story.id)}
                          className={cn("w-full text-left p-2.5 rounded-lg transition-all", isActive ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50 border border-transparent")}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Film className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium truncate flex-1">{story.title || "Untitled Story"}</span>
                            {counts && (
                              <Badge variant={counts.done === counts.total ? "default" : "secondary"} className="text-[9px]">
                                {counts.done}/{counts.total}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground pl-5">
                            <span>{formatDate(story.created_at)}</span>
                            <span>•</span>
                            <span className="capitalize">{story.story_type}</span>
                          </div>
                        </button>
                      );
                    })}
                    {showScripts && scripts.map((script) => {
                      const content = script.script_content as { hook?: string } | null;
                      const isActive = selectedScriptId === script.id;
                      return (
                        <button
                          key={script.id}
                          onClick={() => handleSelectScript(script.id)}
                          className={cn("w-full text-left p-2.5 rounded-lg transition-all", isActive ? "bg-primary/10 border border-primary/30" : "hover:bg-muted/50 border border-transparent")}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium truncate flex-1">{content?.hook?.slice(0, 40) || script.account_id}</span>
                            <Badge variant={script.status === "qa_passed" ? "default" : "secondary"} className="text-[9px]">
                              {script.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground pl-5">
                            <span>{formatDate(script.created_at)}</span>
                            <span>•</span>
                            <span>{script.account_id}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="bg-border/50" />
          <ResizablePanel defaultSize={78} minSize={50}>
            {mode === "create-story" ? (
              <div className="h-full overflow-y-auto"><StoryCreationWizard onStoryCreated={handleStoryCreated} /></div>
            ) : mode === "create-script" ? (
              <ScriptGeneratorEmbed />
            ) : mode === "story" && storyId ? (
              <StoryEditorEmbed storyId={storyId} />
            ) : mode === "script" && selectedScriptId ? (
              <ScriptStudioEmbed scriptId={selectedScriptId} />
            ) : (
              <ProduceEmptyState onNewStory={handleNewStory} onNewScript={handleNewScript} />
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function ProduceEmptyState({ onNewStory, onNewScript }: { onNewStory: () => void; onNewScript: () => void }) {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Clapperboard className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold mb-2">Start Producing</h2>
        <p className="text-muted-foreground text-sm mb-6">Select content from the library, or create something new.</p>
        <div className="flex gap-3 justify-center">
          <Button onClick={onNewStory} className="gap-2"><Film className="h-4 w-4" /> New Story</Button>
          <Button variant="outline" onClick={onNewScript} className="gap-2"><FileText className="h-4 w-4" /> New Script</Button>
        </div>
      </div>
    </div>
  );
}

function StoryEditorEmbed({ storyId }: { storyId: string }) {
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const { data: story, isLoading: storyLoading } = useQuery({
    queryKey: ["story-job", storyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("story_jobs").select("*").eq("id", storyId).maybeSingle();
      if (error) throw error;
      return data as Tables<"story_jobs"> | null;
    },
    enabled: !!storyId,
  });
  const { data: clips = [], refetch: refetchClips } = useQuery({
    queryKey: ["story-clips", storyId],
    queryFn: async () => {
      const { data, error } = await supabase.from("video_jobs").select("*").eq("story_job_id", storyId).order("sequence_index", { ascending: true });
      if (error) throw error;
      return data as Tables<"video_jobs">[];
    },
    enabled: !!storyId,
    refetchInterval: 5000,
  });
  const { data: activeVoiceover } = useStoryVoiceover(storyId);
  const storyboard = useMemo(() => {
    if (!story?.storyboard_json) return null;
    return story.storyboard_json as unknown as Storyboard;
  }, [story?.storyboard_json]);
  const scenes = storyboard?.scenes || [];
  const anchors = (story?.continuity_anchors as unknown as ContinuityAnchors) || {};
  const clipsBySceneId = useMemo(() => {
    const map = new Map<string, Tables<"video_jobs">>();
    for (const clip of clips) {
      const sceneId = clip.scene_id || String(clip.sequence_index);
      const existing = map.get(sceneId);
      if (!existing) { map.set(sceneId, clip); continue; }
      const pri = (s: string) => s === "done" ? 3 : s === "running" || s === "queued" ? 2 : 1;
      if (pri(clip.status) > pri(existing.status)) map.set(sceneId, clip);
    }
    return map;
  }, [clips]);
  const selectedScene = useMemo(() => scenes.find((s) => s.id === selectedSceneId) || null, [selectedSceneId, scenes]);
  const selectedSceneIndex = useMemo(() => scenes.findIndex((s) => s.id === selectedSceneId), [selectedSceneId, scenes]);
  useEffect(() => {
    if (scenes.length > 0 && !selectedSceneId) setSelectedSceneId(scenes[0].id);
  }, [scenes, selectedSceneId]);
  useEffect(() => {
    if (!storyId) return;
    const channel = supabase.channel(`story-clips-${storyId}`).on("postgres_changes", { event: "*", schema: "public", table: "video_jobs", filter: `story_job_id=eq.${storyId}` }, () => refetchClips()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storyId, refetchClips]);
  if (storyLoading) return <div className="h-full flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!story) return <div className="h-full flex items-center justify-center text-muted-foreground">Story not found</div>;
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 border-b bg-card/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold truncate">{story.title || "Untitled Story"}</h2>
          <Badge variant="secondary" className="text-[10px]">{story.status}</Badge>
        </div>
        <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowSettings(!showSettings)}>Settings</Button>
      </div>
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          <ResizablePanel defaultSize={25} minSize={20}>
            <SceneList scenes={scenes} selectedSceneId={selectedSceneId} onSelectScene={setSelectedSceneId} clipsBySceneId={clipsBySceneId} storyId={storyId} storyboard={storyboard} anchors={anchors} voiceover={activeVoiceover} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={45} minSize={30}>
            <StudioPreview scene={selectedScene} sceneIndex={selectedSceneIndex} clip={selectedSceneId ? clipsBySceneId.get(selectedSceneId) : undefined} allClips={selectedSceneId ? clips.filter(c => c.scene_id === selectedSceneId || String(c.sequence_index) === selectedSceneId) : []} storyId={storyId} storyboard={storyboard} voiceover={activeVoiceover} />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={30} minSize={20}>
            {showSettings ? <StorySettings story={story} onClose={() => setShowSettings(false)} /> : <SceneInspector scene={selectedScene} sceneIndex={selectedSceneIndex} clip={selectedSceneId ? clipsBySceneId.get(selectedSceneId) : undefined} allClips={selectedSceneId ? clips.filter(c => c.scene_id === selectedSceneId || String(c.sequence_index) === selectedSceneId) : []} storyId={storyId} storyboard={storyboard} anchors={anchors} />}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function ScriptGeneratorEmbed() {
  return (
    <div className="h-full overflow-y-auto p-6 text-center">
      <h2 className="text-xl font-semibold mb-2">Generate Script</h2>
      <p className="text-sm text-muted-foreground">Script generation controls will appear here.</p>
    </div>
  );
}

function ScriptStudioEmbed({ scriptId }: { scriptId: string }) {
  const navigate = useNavigate();
  return (
    <div className="h-full flex flex-col items-center justify-center p-8">
      <div className="text-center max-w-md">
        <FileText className="h-12 w-12 text-primary mx-auto mb-4" />
        <h2 className="text-lg font-semibold mb-2">Script: {scriptId.slice(0, 8)}...</h2>
        <Button onClick={() => navigate(`/studio/${scriptId}`)}>Open in Studio</Button>
      </div>
    </div>
  );
}
