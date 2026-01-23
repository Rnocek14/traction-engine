import { useState, useCallback, useEffect } from "react";
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
import { PreviewCanvas } from "./PreviewCanvas";
import { ClipTimeline } from "./ClipTimeline";
import { InspectorPanel } from "./InspectorPanel";
import { VersionRail } from "./VersionRail";
import { ActionDock } from "./ActionDock";
import { ClipActions } from "./ClipActions";
import { useStudioEditor } from "@/hooks/use-studio-editor";
import { useTimelineEditor } from "@/hooks/use-timeline-editor";
import type { Tables } from "@/integrations/supabase/types";

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

  // Centralized editor state (for script fields)
  const editor = useStudioEditor({ script });
  
  // Timeline editor (for clips)
  const timeline = useTimelineEditor({ script });

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

  // Keyboard shortcut for version rail toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "KeyV" && !e.metaKey && !e.ctrlKey) {
        setIsVersionRailCollapsed((prev) => !prev);
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

        {/* Main content area */}
        <div className="flex-1 flex flex-col min-w-0 p-3 gap-3">
          {/* Top section: Preview + Inspector */}
          <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
            <ResizablePanel defaultSize={65} minSize={40}>
              <PreviewCanvas
                videoJob={activeVideoJob}
                scenePrompts={timeline.clips.map((c) => c.prompt || "")}
                currentSceneIndex={Math.max(0, currentSceneIndex)}
                onSceneChange={(idx) => {
                  const clip = timeline.clips[idx];
                  if (clip) timeline.setPlayheadPosition(clip.start);
                }}
                onScrubPositionChange={(pos) => timeline.setPlayheadPosition(pos * timeline.duration)}
                className="h-full"
              />
            </ResizablePanel>

            <ResizableHandle withHandle className="mx-2" />

            <ResizablePanel defaultSize={35} minSize={25}>
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
                className="h-full"
              />
            </ResizablePanel>
          </ResizablePanelGroup>

          {/* Bottom section: Timeline + Actions */}
          <div className="flex gap-3">
            <div className="flex-1">
              <ClipTimeline
                clips={timeline.clips}
                selectedClipIds={timeline.selectedClipIds}
                playheadPosition={timeline.playheadPosition}
                duration={timeline.duration}
                voiceover={editor.edits.voiceover}
                audioUrl={(script as unknown as { voiceover_audio_url?: string }).voiceover_audio_url}
                onClipSelect={timeline.selectClip}
                onReorder={timeline.reorderClips}
                onPlayheadChange={timeline.setPlayheadPosition}
                onSplit={timeline.splitAtPlayhead}
                onDelete={timeline.deleteSelected}
                onDuplicate={timeline.duplicateSelected}
                onToggleDisabled={timeline.toggleDisabled}
                onAddClip={() => timeline.addClip("New scene prompt")}
              />
            </div>

            {/* Clip Actions + Action Dock */}
            <div className="w-80 space-y-3">
              <ClipActions
                clip={selectedClip}
                scriptId={script.id}
                onClipUpdated={() => {}}
              />
              <ActionDock script={script} />
            </div>
          </div>
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
