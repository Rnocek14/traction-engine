import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Play, Layers } from "lucide-react";
import { PreviewCanvas } from "./PreviewCanvas";
import { ReelPlayer } from "./ReelPlayer";
import { ClipTimeline } from "./ClipTimeline";
import { InspectorPanel } from "./InspectorPanel";
import { VersionRail } from "./VersionRail";
import { ActionDock } from "./ActionDock";
import { ClipActions } from "./ClipActions";
import { useStudioEditor } from "@/hooks/use-studio-editor";
import { useTimelineEditor } from "@/hooks/use-timeline-editor";
import { useVideoJobs } from "@/hooks/use-video-generation";
import { useBeatMap } from "@/hooks/use-beat-map";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import type { Clip } from "@/types/timeline-types";
import { suggestCutsFromBeats, DEFAULT_ALIGNMENT_CONSTRAINTS } from "@/types/beat-map-types";

type ScriptRun = Tables<"script_runs">;
type VideoJob = Tables<"video_jobs">;

interface StudioLayoutProps {
  script: ScriptRun;
  versionChain: ScriptRun[];
  chainLoading: boolean;
  onVersionSelect: (scriptId: string) => void;
  currentScriptId: string;
}

/**
 * Main DaVinci-style studio layout with resizable panels.
 * Top: Preview + Inspector (65/35 split)
 * Bottom: Timeline + Action Dock
 * Left: Collapsible version rail
 */
export function StudioLayout({
  script,
  versionChain,
  chainLoading,
  onVersionSelect,
  currentScriptId,
}: StudioLayoutProps) {
  const queryClient = useQueryClient();
  const [isVersionRailCollapsed, setIsVersionRailCollapsed] = useState(false);
  const [selectedVideoJobId, setSelectedVideoJobId] = useState<string | null>(null);
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [hoveredClipId, setHoveredClipId] = useState<string | null>(null);
  const [isPlayAllMode, setIsPlayAllMode] = useState(false);

  // Centralized editor state (for script fields)
  const editor = useStudioEditor({ script });
  
  // Timeline editor (for clips)
  const timeline = useTimelineEditor({ script });

  // Get voiceover URL and text for beat map
  const voiceoverAudioUrl = (script as unknown as { voiceover_audio_url?: string }).voiceover_audio_url;
  
  // Beat Map for editorial intelligence
  const { beatMap, isLoading: beatMapLoading } = useBeatMap({
    scriptRunId: script.id,
    voiceoverText: editor.edits.voiceover || "",
    audioUrl: voiceoverAudioUrl,
    clips: timeline.clips,
  });
  
  // Get cut-eligible beats for timeline display
  const cutEligibleBeats = useMemo(() => {
    if (!beatMap?.beats) return [];
    return beatMap.beats.filter(b => b.is_cut_point || b.cut_priority >= 5);
  }, [beatMap]);
  
  // Align clips to beats handler
  const handleAlignToBeats = useCallback(() => {
    if (!beatMap?.beats || timeline.clips.length === 0) return;
    
    // Get target durations from current clips (enabled video clips only)
    const enabledClips = timeline.clips.filter(c => c.type === "video" && !c.disabled);
    const targetDurations = enabledClips.map(c => c.end - c.start);
    
    // Suggest new cut points
    const suggestedCuts = suggestCutsFromBeats(
      beatMap.beats,
      targetDurations,
      0.3,
      { 
        ...DEFAULT_ALIGNMENT_CONSTRAINTS,
        totalDuration: beatMap.duration 
      }
    );
    
    // Apply suggested cuts to create new clip boundaries
    let accumulatedTime = 0;
    const alignedClips: Clip[] = enabledClips.map((clip, index) => {
      const nextCut = suggestedCuts[index];
      const newEnd = nextCut?.time ?? (accumulatedTime + (clip.end - clip.start));
      
      const newClip: Clip = {
        ...clip,
        start: accumulatedTime,
        end: newEnd,
      };
      accumulatedTime = newEnd;
      return newClip;
    });
    
    // Include disabled clips (keep their original relative position)
    const disabledClips = timeline.clips.filter(c => c.disabled || c.type !== "video");
    const allAlignedClips = [...alignedClips, ...disabledClips];
    
    timeline.alignClipsToBeats(allAlignedClips);
  }, [beatMap, timeline]);

  // Version chain IDs for gallery
  const versionChainIds = versionChain.map((s) => s.id).filter((id) => id !== script.id);
  
  // Get selected clip
  const selectedClip = timeline.selectedClips[0] || null;

  // Fetch the selected video job or latest successful one
  const { data: activeVideoJob } = useQuery({
    queryKey: ["active-video-job", script.id, selectedVideoJobId],
    queryFn: async (): Promise<VideoJob | null> => {
      if (selectedVideoJobId) {
        const { data, error } = await supabase
          .from("video_jobs")
          .select("*")
          .eq("id", selectedVideoJobId)
          .single();
        if (error) throw error;
        return data;
      }

      // Fall back to latest completed job
      const { data, error } = await supabase
        .from("video_jobs")
        .select("*")
        .eq("script_run_id", script.id)
        .in("status", ["succeeded", "done"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  // Fetch all video jobs for reel player
  const { data: allVideoJobs = [] } = useVideoJobs(script.id);
  const completedVideos = allVideoJobs.filter(j => j.status === "done" || j.status === "succeeded").length;

  // Keyboard shortcut for version rail toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "KeyV" && !e.metaKey && !e.ctrlKey) {
        setIsVersionRailCollapsed((prev) => !prev);
      }
      // P key toggles Play All mode
      if (e.code === "KeyP" && !e.metaKey && !e.ctrlKey) {
        setIsPlayAllMode((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Calculate current scene index from playhead
  const currentSceneIndex = timeline.clips.length > 0
    ? timeline.clips.findIndex((c) => 
        timeline.playheadPosition >= c.start && timeline.playheadPosition < c.end
      )
    : 0;

  return (
    <>
      <div className="h-[calc(100vh-3.5rem)] flex">
        {/* Left: Version Rail */}
        <VersionRail
          chain={versionChain}
          currentScriptId={currentScriptId}
          onSelectVersion={onVersionSelect}
          isLoading={chainLoading}
          isCollapsed={isVersionRailCollapsed}
          onToggleCollapse={() => setIsVersionRailCollapsed((prev) => !prev)}
        />

        {/* Main content area with vertical resizable split */}
        <div className="flex-1 flex flex-col min-w-0">
          <ResizablePanelGroup direction="vertical" className="flex-1">
            {/* Top: Preview + Inspector */}
            <ResizablePanel defaultSize={72} minSize={40}>
              <div className="h-full p-3 pb-0">
                <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={65} minSize={40}>
                    <div className="relative h-full">
                      {/* Play All / Single Clip toggle */}
                      <div className="absolute top-3 left-3 z-20 flex gap-2">
                        <Button
                          variant={isPlayAllMode ? "default" : "outline"}
                          size="sm"
                          className="gap-2 h-8"
                          onClick={() => setIsPlayAllMode(true)}
                          disabled={completedVideos === 0}
                        >
                          <Play className="h-3.5 w-3.5" />
                          Play All ({completedVideos})
                        </Button>
                        <Button
                          variant={!isPlayAllMode ? "default" : "outline"}
                          size="sm"
                          className="gap-2 h-8"
                          onClick={() => setIsPlayAllMode(false)}
                        >
                          <Layers className="h-3.5 w-3.5" />
                          Single
                        </Button>
                      </div>

                      {/* Player container */}
                      <div className="h-full flex items-center justify-center bg-[hsl(222_47%_4%)]">
                        {isPlayAllMode ? (
                          <ReelPlayer
                            clips={timeline.clips}
                            videoJobs={allVideoJobs}
                            audioUrl={voiceoverAudioUrl}
                            onClipChange={(idx) => {
                              const clip = timeline.clips[idx];
                              if (clip) timeline.setPlayheadPosition(clip.start);
                            }}
                            className="h-full w-full"
                          />
                        ) : (
                          <PreviewCanvas
                            videoJob={activeVideoJob}
                            scenePrompts={timeline.clips.map((c) => c.prompt || "")}
                            currentSceneIndex={Math.max(0, currentSceneIndex)}
                            onSceneChange={(idx) => {
                              const clip = timeline.clips[idx];
                              if (clip) timeline.setPlayheadPosition(clip.start);
                            }}
                            onScrubPositionChange={(pos) => timeline.setPlayheadPosition(pos * timeline.duration)}
                            hoveredClipId={hoveredClipId}
                            className="h-full"
                          />
                        )}
                      </div>
                    </div>
                  </ResizablePanel>

                  <ResizableHandle withHandle className="mx-2" />

                  <ResizablePanel defaultSize={35} minSize={20}>
                    <InspectorPanel
                      script={script}
                      edits={editor.edits}
                      dirtyFields={editor.dirtyFields}
                      isDirty={editor.isDirty || timeline.isDirty}
                      isSaving={editor.isSaving || timeline.isSaving}
                      onUpdateField={editor.updateField}
                      onSave={() => { editor.save(); timeline.save(); }}
                      onReset={editor.resetEdits}
                      onUndo={editor.undo}
                      onRedo={editor.redo}
                      canUndo={editor.canUndo || timeline.canUndo}
                      canRedo={editor.canRedo || timeline.canRedo}
                      selectedVideoJobId={selectedVideoJobId}
                      onSelectVideoJob={setSelectedVideoJobId}
                      onPreviewVideo={setPreviewVideoUrl}
                      versionChainIds={versionChainIds}
                      styleGuide={timeline.styleGuide}
                      onUpdateStyleGuide={timeline.updateStyleGuide}
                      className="h-full"
                    />
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle className="my-1" />

            {/* Bottom: Timeline + Actions */}
            <ResizablePanel defaultSize={28} minSize={18}>
              <div className="h-full p-3 pt-0 flex gap-3">
                <div className="flex-1 min-w-0">
                  <ClipTimeline
                    clips={timeline.clips}
                    selectedClipIds={timeline.selectedClipIds}
                    playheadPosition={timeline.playheadPosition}
                    duration={timeline.duration}
                    voiceover={editor.edits.voiceover}
                    audioUrl={voiceoverAudioUrl}
                    videoJobs={allVideoJobs}
                    onClipSelect={timeline.selectClip}
                    onReorder={timeline.reorderClips}
                    onPlayheadChange={timeline.setPlayheadPosition}
                    onSplit={timeline.splitAtPlayhead}
                    onDelete={timeline.deleteSelected}
                    onDuplicate={timeline.duplicateSelected}
                    onToggleDisabled={timeline.toggleDisabled}
                    onAddClip={() => timeline.addClip("New scene prompt")}
                    onClipHover={setHoveredClipId}
                    onTrimPreview={timeline.previewTrim}
                    onTrimCommit={timeline.commitTrim}
                    rippleMode={timeline.rippleMode}
                    onToggleRipple={() => timeline.setRippleMode(!timeline.rippleMode)}
                    beats={cutEligibleBeats}
                    onAlignToBeats={handleAlignToBeats}
                    hasBeatMap={!!beatMap && !beatMapLoading}
                  />
                </div>

                {/* Clip Actions + Action Dock */}
                <div className="w-72 flex-shrink-0 space-y-3 overflow-y-auto">
                  <ClipActions
                    clip={selectedClip}
                    scriptId={script.id}
                    onClipUpdated={() => {}}
                  />
                  <ActionDock script={script} clips={timeline.clips} />
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>

      {/* Video Preview Modal */}
      <Dialog open={!!previewVideoUrl} onOpenChange={() => setPreviewVideoUrl(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Video Preview</DialogTitle>
          </DialogHeader>
          {previewVideoUrl && (
            <video
              src={previewVideoUrl}
              controls
              autoPlay
              className="w-full rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
