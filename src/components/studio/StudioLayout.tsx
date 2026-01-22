import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { PreviewCanvas } from "./PreviewCanvas";
import { SceneTimeline } from "./SceneTimeline";
import { InspectorPanel } from "./InspectorPanel";
import { VersionRail } from "./VersionRail";
import { ActionDock } from "./ActionDock";
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
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [isVersionRailCollapsed, setIsVersionRailCollapsed] = useState(false);

  // Parse script content
  const content = script.script_content as Record<string, unknown> | null;
  const scenePrompts = (content?.scene_prompts as string[]) || [];

  // Fetch the latest successful video job for this script
  const { data: latestVideoJob } = useQuery({
    queryKey: ["latest-video-job", script.id],
    queryFn: async (): Promise<VideoJob | null> => {
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

  // Sync scene index with scrub position
  useEffect(() => {
    if (scenePrompts.length > 0) {
      const sceneWidth = 1 / scenePrompts.length;
      const newIndex = Math.min(
        Math.floor(scrubPosition / sceneWidth),
        scenePrompts.length - 1
      );
      if (newIndex !== currentSceneIndex) {
        setCurrentSceneIndex(newIndex);
      }
    }
  }, [scrubPosition, scenePrompts.length, currentSceneIndex]);

  const handleSceneSelect = useCallback((index: number) => {
    setCurrentSceneIndex(index);
    // Update scrub position to center of that scene
    if (scenePrompts.length > 0) {
      const sceneWidth = 1 / scenePrompts.length;
      setScrubPosition((index + 0.5) * sceneWidth);
    }
  }, [scenePrompts.length]);

  const handleScrubPositionChange = useCallback((position: number) => {
    setScrubPosition(position);
  }, []);

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

  return (
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
              videoJob={latestVideoJob}
              scenePrompts={scenePrompts}
              currentSceneIndex={currentSceneIndex}
              onSceneChange={handleSceneSelect}
              onScrubPositionChange={handleScrubPositionChange}
              className="h-full"
            />
          </ResizablePanel>

          <ResizableHandle withHandle className="mx-2" />

          <ResizablePanel defaultSize={35} minSize={25}>
            <InspectorPanel script={script} className="h-full" />
          </ResizablePanel>
        </ResizablePanelGroup>

        {/* Bottom section: Timeline + Actions */}
        <div className="flex gap-3">
          <div className="flex-1">
            <SceneTimeline
              scenePrompts={scenePrompts}
              currentSceneIndex={currentSceneIndex}
              onSceneSelect={handleSceneSelect}
              scrubPosition={scrubPosition}
              onScrubPositionChange={handleScrubPositionChange}
            />
          </div>

          {/* Floating Action Dock */}
          <ActionDock script={script} className="w-80" />
        </div>
      </div>
    </div>
  );
}
